import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PayloadCryptoService } from '../crypto/payload-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../wallet/ledger.service';
import {
  JOB_STATUS_TO_DELIVERY,
  aggregateOrderStatus,
  etaFrom,
  nextStatus,
  remainingMinutes,
} from './warming.logic';
import type { StageSnapshot } from './warming.logic';
import type {
  Locale,
  Paginated,
  WarmingJobAction,
  WarmingJobDetail,
  WarmingJobStatus,
  WarmingJobSummary,
  WarmingProgress,
  WarmingTaskView,
} from '@advault/types';
import type {
  OrderItem as DbOrderItem,
  ProductVariant as DbVariant,
  WarmingJob as DbWarmingJob,
  WarmingTask as DbWarmingTask,
} from '@prisma/client';
import type { Env } from '../config/env';

/** Prisma delegates the checkout job-creation path needs (real or tx client). */
type JobCreateTx = Pick<Prisma.TransactionClient, 'warmingPlan' | 'warmingJob' | 'warmingTask'>;

type JobWithRels = DbWarmingJob & {
  orderItem: DbOrderItem & {
    order: { id: string; number: string; userId: string };
    variant: { tier: string | null };
  };
  tasks: DbWarmingTask[];
  accountAsset: { id: string } | null;
  bundle: { status: string } | null;
};

const JOB_INCLUDE = {
  orderItem: {
    include: {
      order: { select: { id: true, number: true, userId: true } },
      variant: { select: { tier: true } },
    },
  },
  tasks: { orderBy: { order: 'asc' } },
  accountAsset: { select: { id: true } },
  bundle: { select: { status: true } },
} satisfies Prisma.WarmingJobInclude;

function localizedName(snapshot: Prisma.JsonValue, locale: Locale, fallback: string): string {
  const names = (snapshot ?? {}) as Partial<Record<Locale, string>>;
  return names[locale] ?? names.en ?? fallback;
}

/**
 * Warming pipeline for MADE_TO_ORDER items (docs/12, docs/14, docs/15). The
 * platform is a work-tracking system: it queues jobs, records stage progress,
 * assembles the delivery bundle and hands it to the buyer's Vault — it never
 * automates the warming itself (docs/09). Checkout creates a queued job with a
 * plan-derived ETA; operators (RBAC support/admin) walk it to delivered.
 */
@Injectable()
export class WarmingService {
  private readonly holdBufferMinutes: number;
  private readonly defaultStageMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: PayloadCryptoService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    config: ConfigService<Env, true>,
  ) {
    this.holdBufferMinutes = config.get('WARMING_HOLD_BUFFER_MINUTES', { infer: true });
    this.defaultStageMinutes = config.get('WARMING_DEFAULT_STAGE_MINUTES', { infer: true });
  }

  // ---------- Checkout: create a queued job (inside the payment tx) ----------

  /**
   * Create the WarmingJob (+ its stage tasks) for a just-created MADE_TO_ORDER
   * line, inside the checkout transaction. The plan's stages are snapshotted
   * onto the job so ETA/progress survive later plan edits (docs/15). Returns
   * the deliveryStatus the line should carry (`queued`).
   */
  async createJobForItem(
    tx: JobCreateTx,
    orderItemId: string,
    variant: Pick<DbVariant, 'warmingPlanId' | 'goal' | 'etaMinutes'>,
  ): Promise<'queued'> {
    const plan = variant.warmingPlanId
      ? await tx.warmingPlan.findUnique({
          where: { id: variant.warmingPlanId },
          include: { stages: { orderBy: { order: 'asc' } } },
        })
      : null;

    // No linked plan → a single synthetic stage from the variant's cached ETA,
    // so every warm line still has a job, an ETA and a stage to show.
    const stages: StageSnapshot[] =
      plan && plan.stages.length > 0
        ? plan.stages.map((s) => ({
            order: s.order,
            name: s.name,
            expectedMinutes: s.expectedMinutes,
          }))
        : [
            {
              order: 0,
              name: 'Preparation',
              expectedMinutes: variant.etaMinutes ?? this.defaultStageMinutes,
            },
          ];

    const now = new Date();
    const etaAt = etaFrom(now, remainingMinutes(stages));

    const job = await tx.warmingJob.create({
      data: {
        orderItemId,
        planId: plan?.id ?? null,
        planVersion: plan?.version ?? 1,
        goal: variant.goal ?? plan?.goal ?? null,
        status: 'queued',
        etaAt,
        slaDueAt: etaAt,
        currentStage: 0,
        stageCount: stages.length,
        stagesSnapshot: stages as unknown as Prisma.InputJsonValue,
      },
    });

    const planStages = plan?.stages ?? [];
    await Promise.all(
      stages.map((stage) =>
        tx.warmingTask.create({
          data: {
            jobId: job.id,
            stageTemplateId: planStages.find((s) => s.order === stage.order)?.id ?? null,
            order: stage.order,
            name: stage.name,
            expectedMinutes: stage.expectedMinutes,
            status: 'pending',
          },
        }),
      ),
    );

    return 'queued';
  }

  /** Buyer-facing warming progress for an order item (or null if no job). */
  buildProgress(job: (DbWarmingJob & { tasks: DbWarmingTask[] }) | null): WarmingProgress | null {
    if (!job) return null;
    const stages = [...job.tasks]
      .sort((a, b) => a.order - b.order)
      .map((task) => ({ order: task.order, name: task.name, status: task.status }));
    const completed = job.currentStage;
    const displayCurrent =
      job.status === 'queued' || job.status === 'assigned'
        ? 0
        : job.status === 'delivered'
          ? job.stageCount
          : Math.min(completed + 1, job.stageCount);
    return {
      status: job.status,
      etaAt:
        job.status === 'delivered' || job.status === 'refunded'
          ? null
          : (job.etaAt?.toISOString() ?? null),
      currentStage: displayCurrent,
      totalStages: job.stageCount,
      stages,
    };
  }

  // ---------- Operator queue (RBAC support/admin) ----------

  async listJobs(
    filters: { status?: WarmingJobStatus; goal?: string; assignedTo?: string },
    page: number,
    limit: number,
    locale: Locale,
  ): Promise<Paginated<WarmingJobSummary>> {
    const where: Prisma.WarmingJobWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.goal ? { goal: filters.goal } : {}),
      ...(filters.assignedTo ? { assignedTo: filters.assignedTo } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.warmingJob.findMany({
        where,
        include: JOB_INCLUDE,
        orderBy: { createdAt: 'asc' }, // oldest first — a work queue
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.warmingJob.count({ where }),
    ]);
    return {
      data: (rows as JobWithRels[]).map((row) => this.toSummary(row, locale)),
      meta: { total, page, limit },
    };
  }

  async getJob(id: string, locale: Locale): Promise<WarmingJobDetail> {
    const job = await this.loadJob(id);
    return this.toDetail(job, locale);
  }

  async assign(
    actorId: string,
    id: string,
    operatorId: string,
    locale: Locale,
  ): Promise<WarmingJobDetail> {
    const job = await this.loadJob(id);
    if (job.status !== 'queued' && job.status !== 'on_hold') {
      throw new ApiException('CONFLICT', `Cannot assign a job in status ${job.status}`, 409, {
        status: job.status,
      });
    }
    const operator = await this.prisma.user.findUnique({ where: { id: operatorId } });
    if (!operator || (operator.role !== 'support' && operator.role !== 'admin')) {
      throw new ApiException('VALIDATION_ERROR', 'operatorId must be a support/admin user', 400, {
        fields: { operatorId: ['not a support/admin user'] },
      });
    }
    await this.prisma.warmingJob.update({
      where: { id },
      data: { status: 'assigned', assignedTo: operatorId },
    });
    await this.syncDeliveryStatus(this.prisma, job.orderItemId, 'assigned', job.orderItem.order.id);
    await this.audit.record({
      actorId,
      action: 'warming.assigned',
      entity: 'WarmingJob',
      entityId: id,
      diff: { operatorId },
    });
    return this.getJob(id, locale);
  }

  /** Non-money status move (start/hold/resume/qc/ready/deliver/fail). */
  async transition(
    actorId: string,
    id: string,
    action: WarmingJobAction,
    note: string | undefined,
    locale: Locale,
  ): Promise<WarmingJobDetail> {
    const job = await this.loadJob(id);
    const target = nextStatus(job.status, action);
    const stages = (job.stagesSnapshot ?? []) as unknown as StageSnapshot[];
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.WarmingJobUpdateInput = { status: target };
      if (note) data.notes = note;
      if (action === 'start' && !job.startedAt) data.startedAt = now;
      if (action === 'hold') {
        data.etaAt = etaFrom(
          now,
          remainingMinutes(stages, job.currentStage) + this.holdBufferMinutes,
        );
      }
      if (action === 'resume') {
        data.etaAt = etaFrom(now, remainingMinutes(stages, job.currentStage));
      }
      if (action === 'ready') data.readyAt = now;
      if (action === 'deliver') {
        data.deliveredAt = now;
        await this.assembleAndDeliver(tx, job, actorId, now);
      }
      await tx.warmingJob.update({ where: { id }, data });
      await this.syncDeliveryStatus(
        tx,
        job.orderItemId,
        JOB_STATUS_TO_DELIVERY[target],
        job.orderItem.order.id,
      );
    });

    await this.audit.record({
      actorId,
      action: `warming.${action}`,
      entity: 'WarmingJob',
      entityId: id,
      diff: { from: job.status, to: target, ...(note ? { note } : {}) },
    });
    return this.getJob(id, locale);
  }

  /** Update one stage task; job.currentStage tracks the number completed. */
  async updateTask(
    actorId: string,
    id: string,
    taskId: string,
    dto: { status?: DbWarmingTask['status']; checklistState?: Record<string, unknown> },
    locale: Locale,
  ): Promise<WarmingJobDetail> {
    const job = await this.loadJob(id);
    const task = job.tasks.find((t) => t.id === taskId);
    if (!task) throw new ApiException('NOT_FOUND', 'Task not found for this job', 404);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.WarmingTaskUpdateInput = {};
      if (dto.status) {
        data.status = dto.status;
        if (dto.status === 'in_progress' && !task.startedAt) data.startedAt = now;
        if (dto.status === 'done') data.doneAt = now;
      }
      if (dto.checklistState !== undefined) {
        data.checklistState = dto.checklistState as Prisma.InputJsonValue;
      }
      if (dto.status) data.operatorId = actorId;
      await tx.warmingTask.update({ where: { id: taskId }, data });

      const done = await tx.warmingTask.count({ where: { jobId: id, status: 'done' } });
      await tx.warmingJob.update({
        where: { id },
        data: { currentStage: Math.min(done, job.stageCount) },
      });
    });

    await this.audit.record({
      actorId,
      action: 'warming.task_updated',
      entity: 'WarmingTask',
      entityId: taskId,
      diff: { jobId: id, status: dto.status ?? null },
    });
    return this.getJob(id, locale);
  }

  /**
   * Capture the encrypted account data for the job (docs/15). Payload/recovery
   * are AES-256-GCM encrypted app-side; plaintext is never stored or logged.
   */
  async setAccountAsset(
    actorId: string,
    id: string,
    dto: { payload: string; recovery?: string; meta?: Record<string, unknown> },
    locale: Locale,
  ): Promise<WarmingJobDetail> {
    const job = await this.loadJob(id);
    if (job.status === 'delivered' || job.status === 'refunded') {
      throw new ApiException('CONFLICT', `Cannot edit account data of a ${job.status} job`, 409);
    }
    const encPayload = this.crypto.encrypt(dto.payload);
    const encRecovery = dto.recovery ? this.crypto.encrypt(dto.recovery) : null;
    const meta = (dto.meta ?? {}) as Prisma.InputJsonValue;
    await this.prisma.accountAsset.upsert({
      where: { jobId: id },
      update: { payload: encPayload, recovery: encRecovery, meta },
      create: { jobId: id, payload: encPayload, recovery: encRecovery, meta },
    });
    await this.audit.record({
      actorId,
      action: 'warming.account_captured',
      entity: 'WarmingJob',
      entityId: id,
      // Never log the secret — only that it was captured and whether recovery came with it.
      diff: { hasRecovery: Boolean(dto.recovery) },
    });
    return this.getJob(id, locale);
  }

  /**
   * Resolve a failed job (docs/14): the operator either reassigns it back to
   * the queue (fresh ETA, tasks reset) or refunds the line to the buyer's
   * balance (ledger credit + audit; the line and job become terminal).
   */
  async resolveFailed(
    actorId: string,
    id: string,
    resolution: 'reassign' | 'refund',
    reason: string | undefined,
    locale: Locale,
  ): Promise<WarmingJobDetail> {
    const job = await this.loadJob(id);
    if (job.status !== 'failed') {
      throw new ApiException('CONFLICT', 'Only a failed job can be resolved', 409, {
        status: job.status,
      });
    }
    const stages = (job.stagesSnapshot ?? []) as unknown as StageSnapshot[];
    const now = new Date();

    if (resolution === 'reassign') {
      await this.prisma.$transaction(async (tx) => {
        await tx.warmingTask.updateMany({
          where: { jobId: id },
          data: { status: 'pending', startedAt: null, doneAt: null, operatorId: null },
        });
        await tx.warmingJob.update({
          where: { id },
          data: {
            status: 'queued',
            assignedTo: null,
            currentStage: 0,
            startedAt: null,
            readyAt: null,
            etaAt: etaFrom(now, remainingMinutes(stages)),
            ...(reason ? { notes: reason } : {}),
          },
        });
        await this.syncDeliveryStatus(tx, job.orderItemId, 'queued', job.orderItem.order.id);
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        const item = await tx.orderItem.findUnique({ where: { id: job.orderItemId } });
        const amount = item!.unitPrice.times(item!.quantity);
        // Refund the line subtotal to the buyer's balance (double entry, docs/05).
        await this.ledger.credit(tx, {
          userId: job.orderItem.order.userId,
          amount,
          refType: 'refund',
          refId: job.orderItemId, // unique per (refType, refId, direction) → no double refund
        });
        await tx.warmingJob.update({
          where: { id },
          data: { status: 'refunded', ...(reason ? { notes: reason } : {}) },
        });
        await this.syncDeliveryStatus(tx, job.orderItemId, 'refunded', job.orderItem.order.id);
      });
    }

    await this.audit.record({
      actorId,
      action: `warming.resolve_${resolution}`,
      entity: 'WarmingJob',
      entityId: id,
      diff: { orderItemId: job.orderItemId, ...(reason ? { reason } : {}) },
    });
    return this.getJob(id, locale);
  }

  // ---------- Internals ----------

  private async loadJob(id: string): Promise<JobWithRels> {
    const job = await this.prisma.warmingJob.findUnique({ where: { id }, include: JOB_INCLUDE });
    if (!job) throw new ApiException('NOT_FOUND', 'Warming job not found', 404);
    return job as JobWithRels;
  }

  /** Set the line status and re-aggregate the order status (docs/14). */
  private async syncDeliveryStatus(
    tx: Pick<Prisma.TransactionClient, 'orderItem' | 'order'>,
    orderItemId: string,
    status: DbOrderItem['deliveryStatus'],
    orderId: string,
  ): Promise<void> {
    await tx.orderItem.update({ where: { id: orderItemId }, data: { deliveryStatus: status } });
    const siblings = await tx.orderItem.findMany({
      where: { orderId },
      select: { deliveryStatus: true },
    });
    const orderStatus = aggregateOrderStatus(siblings.map((s) => s.deliveryStatus));
    await tx.order.update({ where: { id: orderId }, data: { status: orderStatus } });
  }

  /**
   * Assemble the delivery bundle and hand it to the buyer's Vault. Reuses the
   * E5 crypto path: components are gathered from the variant's bundleSpec plus
   * the captured account data, a single readable payload is encrypted, and a
   * warm Delivery is written (decryptable only by the owner, with audit).
   */
  private async assembleAndDeliver(
    tx: Prisma.TransactionClient,
    job: JobWithRels,
    actorId: string,
    now: Date,
  ): Promise<void> {
    const asset = await tx.accountAsset.findUnique({ where: { jobId: job.id } });
    if (!asset) {
      throw new ApiException('CONFLICT', 'Capture the account data before delivering', 409);
    }
    const variant = await tx.productVariant.findUnique({
      where: { id: job.orderItem.variantId },
      select: { bundleSpec: true, warrantyHours: true },
    });
    const spec = (variant?.bundleSpec ?? []) as { type: string; meta?: Record<string, unknown> }[];

    const bundle = await tx.bundle.create({
      data: { jobId: job.id, status: 'delivered', assembledBy: actorId, deliveredAt: now },
    });

    const account = this.crypto.decrypt(asset.payload);
    const recovery = asset.recovery ? this.crypto.decrypt(asset.recovery) : null;
    const lines: string[] = [];
    for (const component of spec) {
      await tx.bundleComponent.create({
        data: {
          bundleId: bundle.id,
          type: component.type as never,
          refId: component.type === 'ACCOUNT' || component.type === 'RECOVERY' ? asset.id : null,
          payload:
            component.type === 'ACCOUNT'
              ? asset.payload
              : component.type === 'RECOVERY' && asset.recovery
                ? asset.recovery
                : null,
          meta: (component.meta ?? {}) as Prisma.InputJsonValue,
        },
      });
      // Human-readable bundle contents for the Vault (secrets included only for
      // account/recovery; resources like PROXY/OCTO are provisioned in E7).
      if (component.type === 'ACCOUNT') lines.push(`ACCOUNT:\n${account}`);
      else if (component.type === 'RECOVERY' && recovery) lines.push(`RECOVERY:\n${recovery}`);
      else if (component.type === 'PROXY')
        lines.push('PROXY: provisioned separately (see order notes)');
      else if (component.type === 'OCTO_PROFILE')
        lines.push('OCTO_PROFILE: provisioned separately (see order notes)');
      else if (component.type === 'GUIDE')
        lines.push('GUIDE: setup guide included with your order');
      else if (component.type === 'WARRANTY')
        lines.push(`WARRANTY: ${variant?.warrantyHours ?? 0}h from delivery`);
    }

    await tx.delivery.create({
      data: {
        orderItemId: job.orderItemId,
        bundleId: bundle.id,
        payload: this.crypto.encrypt(lines.join('\n\n')),
        type: 'warm',
        deliveredBy: actorId,
        deliveredAt: now,
      },
    });
  }

  // ---------- Mapping ----------

  private toSummary(job: JobWithRels, locale: Locale): WarmingJobSummary {
    return {
      id: job.id,
      orderId: job.orderItem.order.id,
      orderNumber: job.orderItem.order.number,
      orderItemId: job.orderItemId,
      sku: job.orderItem.sku,
      name: localizedName(job.orderItem.nameSnapshot, locale, job.orderItem.sku),
      goal: job.goal,
      tier: job.orderItem.variant.tier,
      status: job.status,
      assignedTo: job.assignedTo,
      etaAt: job.etaAt?.toISOString() ?? null,
      slaDueAt: job.slaDueAt?.toISOString() ?? null,
      currentStage: job.currentStage,
      stageCount: job.stageCount,
      createdAt: job.createdAt.toISOString(),
    };
  }

  private toDetail(job: JobWithRels, locale: Locale): WarmingJobDetail {
    const tasks: WarmingTaskView[] = [...job.tasks]
      .sort((a, b) => a.order - b.order)
      .map((task) => ({
        id: task.id,
        order: task.order,
        name: task.name,
        expectedMinutes: task.expectedMinutes,
        status: task.status,
        checklistState: (task.checklistState ?? {}) as Record<string, unknown>,
        startedAt: task.startedAt?.toISOString() ?? null,
        doneAt: task.doneAt?.toISOString() ?? null,
      }));
    return {
      ...this.toSummary(job, locale),
      planId: job.planId,
      planVersion: job.planVersion,
      notes: job.notes,
      hasAccountAsset: Boolean(job.accountAsset),
      bundleStatus: (job.bundle?.status ?? null) as WarmingJobDetail['bundleStatus'],
      tasks,
    };
  }
}
