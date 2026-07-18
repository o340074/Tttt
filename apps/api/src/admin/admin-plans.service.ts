import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeEtaMinutes } from './catalog.logic';
import type {
  AdminWarmingPlanDetail,
  AdminWarmingPlanListItem,
  AdminWarmingStage,
  BundleComponentType,
  CreateWarmingPlanRequest,
  UpdateWarmingPlanRequest,
  WarmingStageInput,
} from '@advault/types';
import type { WarmingPlan as DbPlan, WarmingStageTemplate as DbStage } from '@prisma/client';

type PlanWithStages = DbPlan & { stages: DbStage[] };

/**
 * Warming-plan administration (docs/13 §6). A plan is an ordered list of stages
 * (duration, checklist, required components) plus QC rules; ETA is the sum of
 * stage durations. Plans are versioned: editing the stages bumps `version` and
 * recomputes linked variants' ETA, while jobs already in flight keep the stage
 * snapshot they pinned at checkout (docs/15). Managers/admins only; audited.
 */
@Injectable()
export class AdminPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AdminWarmingPlanListItem[]> {
    const plans = (await this.prisma.warmingPlan.findMany({
      include: { stages: true },
      orderBy: [{ goal: 'asc' }, { tier: 'asc' }, { version: 'desc' }],
    })) as PlanWithStages[];
    return Promise.all(plans.map((p) => this.toListItem(p)));
  }

  async get(id: string): Promise<AdminWarmingPlanDetail> {
    const plan = await this.load(id);
    return this.toDetail(plan);
  }

  async create(actorId: string, body: CreateWarmingPlanRequest): Promise<AdminWarmingPlanDetail> {
    const goal = body.goal.trim();
    const tier = this.normalizeTier(body.tier);
    const name = body.name.trim();
    const stages = this.normalizeStages(body.stages);

    const created = await this.prisma
      .$transaction(async (tx) => {
        const plan = await tx.warmingPlan.create({
          data: {
            goal,
            tier,
            name,
            version: 1,
            isActive: true,
            qcRules: (body.qcRules ?? {}) as Prisma.InputJsonValue,
          },
        });
        await this.writeStages(tx, plan.id, stages);
        return plan;
      })
      .catch((error) => this.rethrowUnique(error));

    await this.audit.record({
      actorId,
      action: 'plan.create',
      entity: 'WarmingPlan',
      entityId: created.id,
      diff: { goal, tier, name, version: 1, stageCount: stages.length },
    });
    return this.get(created.id);
  }

  async update(
    actorId: string,
    id: string,
    body: UpdateWarmingPlanRequest,
  ): Promise<AdminWarmingPlanDetail> {
    const existing = await this.load(id);
    const data: Prisma.WarmingPlanUpdateInput = {};
    if (body.goal !== undefined) data.goal = body.goal.trim();
    if (body.tier !== undefined) data.tier = this.normalizeTier(body.tier);
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.qcRules !== undefined) data.qcRules = body.qcRules as Prisma.InputJsonValue;

    const stages = body.stages ? this.normalizeStages(body.stages) : null;
    const newVersion = stages ? existing.version + 1 : existing.version;
    if (stages) data.version = newVersion;

    await this.prisma
      .$transaction(async (tx) => {
        await tx.warmingPlan.update({ where: { id }, data });
        if (stages) {
          // Replace the stage templates; in-flight jobs are safe (they pinned a
          // snapshot at checkout). Recompute the cached ETA on linked variants.
          await tx.warmingStageTemplate.deleteMany({ where: { planId: id } });
          await this.writeStages(tx, id, stages);
          await tx.productVariant.updateMany({
            where: { warmingPlanId: id, fulfillmentType: 'MADE_TO_ORDER' },
            data: { etaMinutes: computeEtaMinutes(stages) },
          });
        }
      })
      .catch((error) => this.rethrowUnique(error));

    await this.audit.record({
      actorId,
      action: stages ? 'plan.version' : 'plan.update',
      entity: 'WarmingPlan',
      entityId: id,
      diff: {
        ...(body.goal !== undefined ? { goal: body.goal } : {}),
        ...(body.tier !== undefined ? { tier: body.tier } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(stages ? { version: newVersion, stageCount: stages.length } : {}),
      },
    });
    return this.get(id);
  }

  // ---------- Internals ----------

  private async load(id: string): Promise<PlanWithStages> {
    const plan = (await this.prisma.warmingPlan.findUnique({
      where: { id },
      include: { stages: true },
    })) as PlanWithStages | null;
    if (!plan) throw new ApiException('NOT_FOUND', 'Warming plan not found', 404);
    return plan;
  }

  private normalizeTier(tier: string | null | undefined): string | null {
    if (tier === undefined || tier === null) return null;
    const trimmed = tier.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /** Trim names, order 0-based, dedupe required components, default arrays. */
  private normalizeStages(stages: WarmingStageInput[]): WarmingStageInput[] {
    return stages.map((s) => ({
      name: s.name.trim(),
      expectedMinutes: s.expectedMinutes,
      checklist: (s.checklist ?? []).map((c) => c.trim()).filter((c) => c.length > 0),
      requiredComponents: [...new Set(s.requiredComponents ?? [])] as BundleComponentType[],
    }));
  }

  private async writeStages(
    tx: Pick<PrismaService, 'warmingStageTemplate'>,
    planId: string,
    stages: WarmingStageInput[],
  ): Promise<void> {
    for (let order = 0; order < stages.length; order += 1) {
      const stage = stages[order]!;
      await tx.warmingStageTemplate.create({
        data: {
          planId,
          order,
          name: stage.name,
          expectedMinutes: stage.expectedMinutes,
          checklist: (stage.checklist ?? []) as Prisma.InputJsonValue,
          requiredComponents: (stage.requiredComponents ?? []) as Prisma.InputJsonValue,
        },
      });
    }
  }

  private rethrowUnique(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApiException(
        'CONFLICT',
        'A warming plan already exists for this goal/tier — edit it instead',
        409,
      );
    }
    throw error;
  }

  private toStages(rows: DbStage[]): AdminWarmingStage[] {
    return [...rows]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        order: s.order,
        name: s.name,
        expectedMinutes: s.expectedMinutes,
        checklist: (s.checklist ?? []) as string[],
        requiredComponents: (s.requiredComponents ?? []) as BundleComponentType[],
      }));
  }

  private async variantCount(planId: string): Promise<number> {
    return this.prisma.productVariant.count({ where: { warmingPlanId: planId } });
  }

  private async toListItem(plan: PlanWithStages): Promise<AdminWarmingPlanListItem> {
    const stages = this.toStages(plan.stages);
    return {
      id: plan.id,
      name: plan.name,
      goal: plan.goal,
      tier: plan.tier,
      version: plan.version,
      isActive: plan.isActive,
      stageCount: stages.length,
      etaMinutes: computeEtaMinutes(stages),
      variantCount: await this.variantCount(plan.id),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  private async toDetail(plan: PlanWithStages): Promise<AdminWarmingPlanDetail> {
    return {
      ...(await this.toListItem(plan)),
      qcRules: (plan.qcRules ?? {}) as Record<string, unknown>,
      stages: this.toStages(plan.stages),
      createdAt: plan.createdAt.toISOString(),
    };
  }
}
