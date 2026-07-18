import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { makeFakePrismaService } from '../testing/fakes';
import { AdminPlansService } from './admin-plans.service';

/**
 * AdminPlansService over the in-memory fakes: create with stages, ETA = sum of
 * durations, versioning that bumps `version` and recomputes linked variants'
 * ETA (while jobs keep their pinned snapshot), metadata edits and archiving.
 */
describe('AdminPlansService (E8 warming plans CRUD)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let plans: AdminPlansService;
  const adminId = randomUUID();

  beforeEach(() => {
    prisma = makeFakePrismaService();
    plans = new AdminPlansService(prisma, new AuditService(prisma));
  });

  const basePlan = {
    goal: 'google_ads',
    tier: 'warm_7d',
    name: 'Google Ads · 7d',
    stages: [
      { name: 'Setup', expectedMinutes: 60 },
      { name: 'Warm-up', expectedMinutes: 180 },
    ],
  };

  it('creates a plan with stages, ETA = sum, version 1 (audited)', async () => {
    const plan = await plans.create(adminId, basePlan);
    expect(plan.version).toBe(1);
    expect(plan.stageCount).toBe(2);
    expect(plan.etaMinutes).toBe(240);
    expect(plan.stages.map((s) => s.order)).toEqual([0, 1]);
    expect(prisma.auditLog.rows.some((a) => a.action === 'plan.create')).toBe(true);
  });

  it('409s on a duplicate goal/tier', async () => {
    await plans.create(adminId, basePlan);
    await expect(plans.create(adminId, basePlan)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('metadata edit keeps the version; stage edit bumps it and recomputes linked ETA', async () => {
    const plan = await plans.create(adminId, basePlan);

    // A MADE_TO_ORDER variant linked to the plan, with the initial ETA.
    const variantId = randomUUID();
    prisma.productVariant.rows.push({
      id: variantId,
      productId: randomUUID(),
      sku: 'AV-1',
      price: new Prisma.Decimal('10.00'),
      currency: 'USD',
      fulfillmentType: 'MADE_TO_ORDER',
      deliveryType: 'manual',
      stockCount: 0,
      isActive: true,
      attributes: {},
      goal: 'google_ads',
      tier: 'warm_7d',
      warmingPlanId: plan.id,
      bundleSpec: [],
      etaMinutes: 240,
      warrantyHours: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const renamed = await plans.update(adminId, plan.id, { name: 'Renamed' });
    expect(renamed.version).toBe(1);
    expect(renamed.name).toBe('Renamed');

    const versioned = await plans.update(adminId, plan.id, {
      stages: [
        { name: 'Setup', expectedMinutes: 30 },
        { name: 'Warm-up', expectedMinutes: 90 },
        { name: 'QC', expectedMinutes: 30 },
      ],
    });
    expect(versioned.version).toBe(2);
    expect(versioned.stageCount).toBe(3);
    expect(versioned.etaMinutes).toBe(150);
    // Linked variant's cached ETA followed the new plan.
    expect(prisma.productVariant.rows.find((v) => v.id === variantId)?.etaMinutes).toBe(150);
    expect(prisma.auditLog.rows.some((a) => a.action === 'plan.version')).toBe(true);
  });

  it('archives a plan (isActive:false) and lists it', async () => {
    const plan = await plans.create(adminId, basePlan);
    const archived = await plans.update(adminId, plan.id, { isActive: false });
    expect(archived.isActive).toBe(false);
    const list = await plans.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.variantCount).toBe(0);
  });

  it('404s on an unknown plan', async () => {
    await expect(plans.get(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
