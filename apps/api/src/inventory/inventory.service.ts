import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateOctoProfileRequest,
  CreateProxyRequest,
  JobInventory,
  OctoProfileStatus,
  OctoProfileView,
  Paginated,
  ProxyImportReport,
  ProxyItemView,
  ProxyStatus,
  UpdateOctoProfileRequest,
} from '@advault/types';
import type { OctoProfile as DbOctoProfile, ProxyItem as DbProxyItem } from '@prisma/client';

/** Prisma delegates the bundle assembly path needs when reading bound resources (real or tx client). */
export type InventoryReadTx = Pick<Prisma.TransactionClient, 'proxyItem' | 'octoProfile'>;

/**
 * Inventory of proxies and Octo antidetect profiles (docs/12, docs/15). The
 * platform is a ledger of resources and their bindings to warming jobs — it
 * never provisions proxies or creates Octo profiles (that is manual operator
 * work, platform boundary docs/09). Secrets (`credentials`, `exportRef`) are
 * AES-256-GCM encrypted app-side, never logged and never returned by the
 * operator endpoints; they surface only in the owner's Vault once a bundle is
 * delivered (WarmingService.assembleAndDeliver).
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: PayloadCryptoService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Proxies ----------

  async createProxy(actorId: string, dto: CreateProxyRequest): Promise<ProxyItemView> {
    const credentials = dto.credentials.trim();
    if (!credentials) {
      throw new ApiException('VALIDATION_ERROR', 'credentials must not be empty', 400, {
        fields: { credentials: ['must not be empty'] },
      });
    }
    const hash = this.crypto.hash(credentials);
    const existing = await this.prisma.proxyItem.findUnique({ where: { credentialsHash: hash } });
    if (existing) {
      throw new ApiException('CONFLICT', 'A proxy with these credentials already exists', 409);
    }
    const row = await this.prisma.proxyItem.create({
      data: {
        type: dto.type,
        geo: dto.geo,
        provider: dto.provider,
        credentials: this.crypto.encrypt(credentials),
        credentialsHash: hash,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        meta: (dto.meta ?? {}) as Prisma.InputJsonValue,
        createdBy: actorId,
      },
    });
    await this.audit.record({
      actorId,
      action: 'inventory.proxy_created',
      entity: 'ProxyItem',
      entityId: row.id,
      // Never log the credentials — only non-secret descriptors.
      diff: { type: dto.type, geo: dto.geo, provider: dto.provider },
    });
    return this.toProxyView(row);
  }

  /**
   * Bulk import proxies — JSON `{ items: CreateProxyRequest[] }` or a raw
   * text/plain file (one proxy per line: `type,geo,provider,host:port:user:pass[,expiresAt]`).
   * Credentials are encrypted; blanks, malformed lines and duplicates are skipped.
   */
  async importProxies(actorId: string, body: unknown): Promise<ProxyImportReport> {
    const items = this.parseProxyImport(body);
    let added = 0;
    let skipped = 0;
    const seen = new Set<string>();
    for (const item of items) {
      const credentials = item.credentials.trim();
      if (!credentials || !item.type || !item.geo || !item.provider) {
        skipped += 1;
        continue;
      }
      const hash = this.crypto.hash(credentials);
      if (seen.has(hash)) {
        skipped += 1; // duplicate within the same import batch
        continue;
      }
      seen.add(hash);
      try {
        await this.prisma.proxyItem.create({
          data: {
            type: item.type,
            geo: item.geo,
            provider: item.provider,
            credentials: this.crypto.encrypt(credentials),
            credentialsHash: hash,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
            meta: (item.meta ?? {}) as Prisma.InputJsonValue,
            createdBy: actorId,
          },
        });
        added += 1;
      } catch (error) {
        // Unique(credentialsHash) → this proxy already exists in the pool.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
    await this.audit.record({
      actorId,
      action: 'inventory.proxy_import',
      entity: 'ProxyItem',
      diff: { added, skipped },
    });
    return { added, skipped };
  }

  async listProxies(
    filters: { status?: ProxyStatus; type?: string; unassigned?: boolean },
    page: number,
    limit: number,
  ): Promise<Paginated<ProxyItemView>> {
    const where: Prisma.ProxyItemWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type as DbProxyItem['type'] } : {}),
      ...(filters.unassigned ? { assignedJobId: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.proxyItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.proxyItem.count({ where }),
    ]);
    return { data: rows.map((r) => this.toProxyView(r)), meta: { total, page, limit } };
  }

  /** Bind a free proxy to a warming job (available → assigned, exactly once). */
  async bindProxy(actorId: string, proxyId: string, jobId: string): Promise<ProxyItemView> {
    await this.assertBindableJob(jobId);
    // One proxy per job: assignedJobId is unique, but check first for a clear 409.
    const already = await this.prisma.proxyItem.findUnique({ where: { assignedJobId: jobId } });
    if (already && already.id !== proxyId) {
      throw new ApiException('CONFLICT', 'This job already has a proxy bound', 409, {
        proxyItemId: already.id,
      });
    }
    // Guarded update: only an available, unbound proxy can be claimed — exactly-once.
    const claimed = await this.prisma.proxyItem.updateMany({
      where: { id: proxyId, status: 'available', assignedJobId: null },
      data: { status: 'assigned', assignedJobId: jobId },
    });
    if (claimed.count === 0) {
      const row = await this.prisma.proxyItem.findUnique({ where: { id: proxyId } });
      if (!row) throw new ApiException('NOT_FOUND', 'Proxy not found', 404);
      throw new ApiException('CONFLICT', `Proxy is not available (status ${row.status})`, 409, {
        status: row.status,
      });
    }
    const row = await this.prisma.proxyItem.findUnique({ where: { id: proxyId } });
    await this.audit.record({
      actorId,
      action: 'inventory.proxy_bound',
      entity: 'ProxyItem',
      entityId: proxyId,
      diff: { jobId },
    });
    return this.toProxyView(row!);
  }

  /** Release a proxy from its job back into the pool (assigned → available). */
  async unbindProxy(actorId: string, proxyId: string): Promise<ProxyItemView> {
    const row = await this.prisma.proxyItem.findUnique({ where: { id: proxyId } });
    if (!row) throw new ApiException('NOT_FOUND', 'Proxy not found', 404);
    if (row.status !== 'assigned' || !row.assignedJobId) {
      throw new ApiException('CONFLICT', 'Proxy is not bound to a job', 409, {
        status: row.status,
      });
    }
    await this.assertJobNotDelivered(row.assignedJobId);
    const updated = await this.prisma.proxyItem.update({
      where: { id: proxyId },
      data: { status: 'available', assignedJobId: null },
    });
    await this.audit.record({
      actorId,
      action: 'inventory.proxy_unbound',
      entity: 'ProxyItem',
      entityId: proxyId,
      diff: { jobId: row.assignedJobId },
    });
    return this.toProxyView(updated);
  }

  // ---------- Octo profiles ----------

  async createOcto(actorId: string, dto: CreateOctoProfileRequest): Promise<OctoProfileView> {
    if (dto.proxyItemId) await this.assertProxyExists(dto.proxyItemId);
    const row = await this.prisma.octoProfile.create({
      data: {
        name: dto.name,
        externalId: dto.externalId ?? null,
        proxyItemId: dto.proxyItemId ?? null,
        exportRef: dto.exportRef ? this.crypto.encrypt(dto.exportRef) : null,
        fingerprintRef: (dto.fingerprintRef ?? undefined) as Prisma.InputJsonValue | undefined,
        meta: (dto.meta ?? {}) as Prisma.InputJsonValue,
        createdBy: actorId,
      },
    });
    await this.audit.record({
      actorId,
      action: 'inventory.octo_created',
      entity: 'OctoProfile',
      entityId: row.id,
      diff: { name: dto.name, hasExport: Boolean(dto.exportRef) },
    });
    return this.toOctoView(row);
  }

  async updateOcto(
    actorId: string,
    id: string,
    dto: UpdateOctoProfileRequest,
  ): Promise<OctoProfileView> {
    const existing = await this.prisma.octoProfile.findUnique({ where: { id } });
    if (!existing) throw new ApiException('NOT_FOUND', 'Octo profile not found', 404);
    if (dto.proxyItemId) await this.assertProxyExists(dto.proxyItemId);
    const data: Prisma.OctoProfileUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.externalId !== undefined) data.externalId = dto.externalId;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.proxyItemId !== undefined) {
      data.proxyItem = dto.proxyItemId
        ? { connect: { id: dto.proxyItemId } }
        : { disconnect: true };
    }
    if (dto.exportRef !== undefined) {
      data.exportRef = dto.exportRef ? this.crypto.encrypt(dto.exportRef) : null;
    }
    if (dto.fingerprintRef !== undefined) {
      data.fingerprintRef = (dto.fingerprintRef ?? Prisma.DbNull) as Prisma.InputJsonValue;
    }
    if (dto.meta !== undefined) data.meta = dto.meta as Prisma.InputJsonValue;
    const row = await this.prisma.octoProfile.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'inventory.octo_updated',
      entity: 'OctoProfile',
      entityId: id,
      // Never log the export reference — only which fields changed.
      diff: { fields: Object.keys(dto), exportChanged: dto.exportRef !== undefined },
    });
    return this.toOctoView(row);
  }

  async listOcto(
    filters: { status?: OctoProfileStatus; unassigned?: boolean },
    page: number,
    limit: number,
  ): Promise<Paginated<OctoProfileView>> {
    const where: Prisma.OctoProfileWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.unassigned ? { jobId: null } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.octoProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.octoProfile.count({ where }),
    ]);
    return { data: rows.map((r) => this.toOctoView(r)), meta: { total, page, limit } };
  }

  /**
   * Bind a free Octo profile to a warming job (exactly once). Links the job's
   * bound proxy by default so the delivered bundle is a coherent set; the
   * profile advances draft → ready.
   */
  async bindOcto(
    actorId: string,
    octoId: string,
    jobId: string,
    proxyItemId?: string | null,
  ): Promise<OctoProfileView> {
    await this.assertBindableJob(jobId);
    const already = await this.prisma.octoProfile.findUnique({ where: { jobId } });
    if (already && already.id !== octoId) {
      throw new ApiException('CONFLICT', 'This job already has an Octo profile bound', 409, {
        octoProfileId: already.id,
      });
    }
    // Default the linked proxy to whatever proxy is bound to the job.
    let linkedProxyId = proxyItemId ?? null;
    if (linkedProxyId) {
      await this.assertProxyExists(linkedProxyId);
    } else {
      const jobProxy = await this.prisma.proxyItem.findUnique({ where: { assignedJobId: jobId } });
      linkedProxyId = jobProxy?.id ?? null;
    }
    // Guarded update: only a free (jobId=null), non-delivered profile can be claimed.
    const claimed = await this.prisma.octoProfile.updateMany({
      where: { id: octoId, jobId: null, status: { in: ['draft', 'ready'] } },
      data: { jobId, status: 'ready', proxyItemId: linkedProxyId },
    });
    if (claimed.count === 0) {
      const row = await this.prisma.octoProfile.findUnique({ where: { id: octoId } });
      if (!row) throw new ApiException('NOT_FOUND', 'Octo profile not found', 404);
      throw new ApiException('CONFLICT', `Octo profile is not free (status ${row.status})`, 409, {
        status: row.status,
        jobId: row.jobId,
      });
    }
    const row = await this.prisma.octoProfile.findUnique({ where: { id: octoId } });
    await this.audit.record({
      actorId,
      action: 'inventory.octo_bound',
      entity: 'OctoProfile',
      entityId: octoId,
      diff: { jobId, proxyItemId: linkedProxyId },
    });
    return this.toOctoView(row!);
  }

  /** Release an Octo profile from its job (→ draft, unlink job). */
  async unbindOcto(actorId: string, octoId: string): Promise<OctoProfileView> {
    const row = await this.prisma.octoProfile.findUnique({ where: { id: octoId } });
    if (!row) throw new ApiException('NOT_FOUND', 'Octo profile not found', 404);
    if (!row.jobId) {
      throw new ApiException('CONFLICT', 'Octo profile is not bound to a job', 409);
    }
    await this.assertJobNotDelivered(row.jobId);
    const updated = await this.prisma.octoProfile.update({
      where: { id: octoId },
      data: { jobId: null, status: 'draft' },
    });
    await this.audit.record({
      actorId,
      action: 'inventory.octo_unbound',
      entity: 'OctoProfile',
      entityId: octoId,
      diff: { jobId: row.jobId },
    });
    return this.toOctoView(updated);
  }

  // ---------- Job-centric view ----------

  /** Resources currently bound to a warming job (operator view; no secrets). */
  async getJobInventory(jobId: string): Promise<JobInventory> {
    const [proxy, octo] = await Promise.all([
      this.prisma.proxyItem.findUnique({ where: { assignedJobId: jobId } }),
      this.prisma.octoProfile.findUnique({ where: { jobId } }),
    ]);
    return {
      proxy: proxy ? this.toProxyView(proxy) : null,
      octo: octo ? this.toOctoView(octo) : null,
    };
  }

  // ---------- Internals ----------

  private async assertBindableJob(jobId: string): Promise<void> {
    const job = await this.prisma.warmingJob.findUnique({ where: { id: jobId } });
    if (!job) throw new ApiException('NOT_FOUND', 'Warming job not found', 404);
    if (job.status === 'delivered' || job.status === 'refunded') {
      throw new ApiException('CONFLICT', `Cannot bind resources to a ${job.status} job`, 409, {
        status: job.status,
      });
    }
  }

  private async assertJobNotDelivered(jobId: string): Promise<void> {
    const job = await this.prisma.warmingJob.findUnique({ where: { id: jobId } });
    if (job && (job.status === 'delivered' || job.status === 'refunded')) {
      throw new ApiException('CONFLICT', `Cannot unbind from a ${job.status} job`, 409, {
        status: job.status,
      });
    }
  }

  private async assertProxyExists(proxyId: string): Promise<void> {
    const proxy = await this.prisma.proxyItem.findUnique({ where: { id: proxyId } });
    if (!proxy) {
      throw new ApiException('VALIDATION_ERROR', 'proxyItemId does not exist', 400, {
        fields: { proxyItemId: ['not found'] },
      });
    }
  }

  private parseProxyImport(body: unknown): CreateProxyRequest[] {
    // JSON body → { items: [...] }; text/plain → newline-separated CSV lines.
    if (typeof body === 'string') {
      return body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .map((line) => this.parseProxyLine(line));
    }
    if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) {
      return (body as { items: CreateProxyRequest[] }).items;
    }
    throw new ApiException(
      'VALIDATION_ERROR',
      'Expected { items: [...] } or a text/plain body',
      400,
    );
  }

  /** `type,geo,provider,host:port:user:pass[,expiresAt]` — credentials keep their colons. */
  private parseProxyLine(line: string): CreateProxyRequest {
    const parts = line.split(',');
    const [type, geo, provider, credentials, expiresAt] = [
      parts[0]?.trim(),
      parts[1]?.trim(),
      parts[2]?.trim(),
      parts[3]?.trim(),
      parts[4]?.trim(),
    ];
    return {
      type: type as CreateProxyRequest['type'],
      geo: geo ?? '',
      provider: provider ?? '',
      credentials: credentials ?? '',
      expiresAt: expiresAt || null,
    };
  }

  private toProxyView(row: DbProxyItem): ProxyItemView {
    return {
      id: row.id,
      type: row.type,
      geo: row.geo,
      provider: row.provider,
      status: row.status,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      assignedJobId: row.assignedJobId,
      meta: (row.meta ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toOctoView(row: DbOctoProfile): OctoProfileView {
    return {
      id: row.id,
      externalId: row.externalId,
      name: row.name,
      status: row.status,
      proxyItemId: row.proxyItemId,
      jobId: row.jobId,
      fingerprintRef: (row.fingerprintRef ?? null) as Record<string, unknown> | null,
      meta: (row.meta ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
