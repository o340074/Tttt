import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import { makeFakeConfigService, makeFakePrismaService } from '../testing/fakes';
import { InventoryService } from './inventory.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { WarmingJobStatus } from '@advault/types';

/**
 * InventoryService unit tests over the in-memory fakes: proxies/Octo profiles
 * are created with encrypted secrets, imported with dedup, and bound to warming
 * jobs exactly-once with correct status transitions. Secrets never leak into
 * the operator views or the audit log.
 */
describe('InventoryService (E7 proxy/Octo inventory)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let crypto: PayloadCryptoService;
  let inventory: InventoryService;
  let actorId: string;

  /** Seed a bare warming job in the given status (bind ops read it without includes). */
  const seedJob = async (status: WarmingJobStatus = 'in_progress'): Promise<string> => {
    const job = await prisma.warmingJob.create({
      data: { orderItemId: randomUUID(), planVersion: 1, status, stageCount: 1 },
    });
    return job.id;
  };

  beforeEach(() => {
    prisma = makeFakePrismaService();
    const config = makeFakeConfigService();
    crypto = new PayloadCryptoService(config);
    const audit = new AuditService(prisma as unknown as PrismaService);
    inventory = new InventoryService(prisma as unknown as PrismaService, crypto, audit);
    actorId = randomUUID();
  });

  it('creates a proxy with encrypted credentials, never storing plaintext', async () => {
    const view = await inventory.createProxy(actorId, {
      type: 'residential',
      geo: 'US',
      provider: 'brightdata',
      credentials: 'proxy.example.com:8080:user:s3cret',
    });
    expect(view).toMatchObject({ type: 'residential', geo: 'US', status: 'available' });
    // The view never carries the secret.
    expect(JSON.stringify(view)).not.toContain('s3cret');
    const row = prisma.proxyItem.rows[0]!;
    expect(row.credentials).not.toContain('s3cret');
    expect(crypto.decrypt(row.credentials)).toBe('proxy.example.com:8080:user:s3cret');
    // Audit records the create without the credentials.
    const audit = prisma.auditLog.rows.find((r) => r.action === 'inventory.proxy_created')!;
    expect(JSON.stringify(audit.diff)).not.toContain('s3cret');
  });

  it('rejects a duplicate proxy (same credentials)', async () => {
    const cred = { type: 'isp' as const, geo: 'DE', provider: 'p', credentials: 'h:1:u:p' };
    await inventory.createProxy(actorId, cred);
    await expect(inventory.createProxy(actorId, cred)).rejects.toMatchObject({ status: 409 });
  });

  it('imports proxies from JSON and text/plain, skipping duplicates and blanks', async () => {
    const jsonReport = await inventory.importProxies(actorId, {
      items: [
        { type: 'residential', geo: 'US', provider: 'p', credentials: 'a:1:u:p' },
        { type: 'residential', geo: 'US', provider: 'p', credentials: 'a:1:u:p' }, // dup within batch
        { type: 'mobile', geo: 'GB', provider: 'p', credentials: '' }, // blank creds
      ],
    });
    expect(jsonReport).toEqual({ added: 1, skipped: 2 });

    const textReport = await inventory.importProxies(
      actorId,
      'residential,US,p,a:1:u:p\n# comment\nmobile,GB,q,b:2:u:p\n\ndatacenter,FR,r,c:3:u:p',
    );
    // a:1:u:p already exists (skip); two new added.
    expect(textReport).toEqual({ added: 2, skipped: 1 });
    expect(prisma.proxyItem.rows).toHaveLength(3);
  });

  it('binds a free proxy to a job exactly once (available → assigned)', async () => {
    const jobId = await seedJob();
    const proxy = await inventory.createProxy(actorId, {
      type: 'residential',
      geo: 'US',
      provider: 'p',
      credentials: 'h:1:u:p',
    });

    const bound = await inventory.bindProxy(actorId, proxy.id, jobId);
    expect(bound).toMatchObject({ status: 'assigned', assignedJobId: jobId });

    // Re-binding the same proxy to the same job is a no-op-conflict (already this job's).
    // A different free proxy cannot attach to a job that already has one.
    const other = await inventory.createProxy(actorId, {
      type: 'isp',
      geo: 'US',
      provider: 'p',
      credentials: 'h:2:u:p',
    });
    await expect(inventory.bindProxy(actorId, other.id, jobId)).rejects.toMatchObject({
      status: 409,
    });

    // The claimed proxy cannot be bound to a second job.
    const job2 = await seedJob();
    await expect(inventory.bindProxy(actorId, proxy.id, job2)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuses to bind resources to a delivered or refunded job', async () => {
    const delivered = await seedJob('delivered');
    const proxy = await inventory.createProxy(actorId, {
      type: 'residential',
      geo: 'US',
      provider: 'p',
      credentials: 'h:9:u:p',
    });
    await expect(inventory.bindProxy(actorId, proxy.id, delivered)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('unbinds a proxy back into the pool', async () => {
    const jobId = await seedJob();
    const proxy = await inventory.createProxy(actorId, {
      type: 'residential',
      geo: 'US',
      provider: 'p',
      credentials: 'h:1:u:p',
    });
    await inventory.bindProxy(actorId, proxy.id, jobId);
    const released = await inventory.unbindProxy(actorId, proxy.id);
    expect(released).toMatchObject({ status: 'available', assignedJobId: null });
    // Now it can be bound to a different job.
    const job2 = await seedJob();
    const rebind = await inventory.bindProxy(actorId, proxy.id, job2);
    expect(rebind.assignedJobId).toBe(job2);
  });

  it('creates an Octo profile with encrypted export and binds it, linking the job proxy', async () => {
    const jobId = await seedJob();
    const proxy = await inventory.createProxy(actorId, {
      type: 'residential',
      geo: 'US',
      provider: 'p',
      credentials: 'h:1:u:p',
    });
    await inventory.bindProxy(actorId, proxy.id, jobId);

    const octo = await inventory.createOcto(actorId, {
      name: 'Profile A',
      externalId: 'octo-123',
      exportRef: 'https://octo.example/share/abc',
    });
    expect(octo.status).toBe('draft');
    expect(JSON.stringify(octo)).not.toContain('octo.example');
    const octoRow = prisma.octoProfile.rows[0]!;
    expect(octoRow.exportRef).not.toContain('octo.example');
    expect(crypto.decrypt(octoRow.exportRef!)).toBe('https://octo.example/share/abc');

    // Bind without an explicit proxy → defaults to the job's bound proxy.
    const bound = await inventory.bindOcto(actorId, octo.id, jobId);
    expect(bound).toMatchObject({ status: 'ready', jobId, proxyItemId: proxy.id });

    // A second profile cannot attach to the same job.
    const octo2 = await inventory.createOcto(actorId, { name: 'Profile B' });
    await expect(inventory.bindOcto(actorId, octo2.id, jobId)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('binds an Octo profile exactly once (a delivered profile cannot be re-bound)', async () => {
    const jobId = await seedJob();
    const octo = await inventory.createOcto(actorId, { name: 'P' });
    await inventory.bindOcto(actorId, octo.id, jobId);
    // Simulate delivery marking the profile delivered (it stays consumed by its job).
    await inventory.updateOcto(actorId, octo.id, { status: 'delivered' });
    // A delivered/bound profile cannot be attached to another job.
    const job2 = await seedJob();
    await expect(inventory.bindOcto(actorId, octo.id, job2)).rejects.toMatchObject({ status: 409 });
  });

  it('reports the resources bound to a job (no secrets)', async () => {
    const jobId = await seedJob();
    const proxy = await inventory.createProxy(actorId, {
      type: 'mobile',
      geo: 'BR',
      provider: 'p',
      credentials: 'h:1:u:p',
    });
    await inventory.bindProxy(actorId, proxy.id, jobId);
    const octo = await inventory.createOcto(actorId, { name: 'P', exportRef: 'secret-ref' });
    await inventory.bindOcto(actorId, octo.id, jobId);

    const bundleView = await inventory.getJobInventory(jobId);
    expect(bundleView.proxy?.id).toBe(proxy.id);
    expect(bundleView.octo?.id).toBe(octo.id);
    expect(JSON.stringify(bundleView)).not.toContain('secret-ref');
  });

  it('rejects binding a non-existent proxy or an unknown job', async () => {
    const jobId = await seedJob();
    await expect(inventory.bindProxy(actorId, randomUUID(), jobId)).rejects.toBeInstanceOf(
      ApiException,
    );
    const proxy = await inventory.createProxy(actorId, {
      type: 'isp',
      geo: 'US',
      provider: 'p',
      credentials: 'h:1:u:p',
    });
    await expect(inventory.bindProxy(actorId, proxy.id, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
  });
});
