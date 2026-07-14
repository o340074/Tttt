import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service';
import { makeFakePrismaService } from '../testing/fakes';
import { AdminPromoService } from './admin-promo.service';

/**
 * AdminPromoService over the in-memory fakes: create/update/delete with the
 * per-type value validation (percent 1–100, fixed >0), code normalization and
 * uniqueness, and audit entries on every mutation.
 */
describe('AdminPromoService (E8 promo CRUD)', () => {
  let prisma: ReturnType<typeof makeFakePrismaService>;
  let promo: AdminPromoService;
  const adminId = randomUUID();

  beforeEach(() => {
    prisma = makeFakePrismaService();
    promo = new AdminPromoService(prisma, new AuditService(prisma));
  });

  it('creates a percent code (uppercased, audited) and lists it', async () => {
    const created = await promo.create(adminId, { code: 'save10', type: 'percent', value: '10' });
    expect(created.code).toBe('SAVE10');
    expect(created.value).toBe('10.00');
    expect(prisma.auditLog.rows.some((a) => a.action === 'promo.create')).toBe(true);

    const list = await promo.list();
    expect(list).toHaveLength(1);
  });

  it('rejects a percent value over 100', async () => {
    await expect(
      promo.create(adminId, { code: 'BIG', type: 'percent', value: '150' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a non-positive fixed value', async () => {
    await expect(
      promo.create(adminId, { code: 'ZERO', type: 'fixed', value: '0' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a malformed code', async () => {
    await expect(
      promo.create(adminId, { code: 'has space', type: 'fixed', value: '5' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('409s on a duplicate code', async () => {
    await promo.create(adminId, { code: 'DUP', type: 'fixed', value: '5' });
    await expect(
      promo.create(adminId, { code: 'dup', type: 'fixed', value: '5' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('updates value/limits and re-validates against the (new) type', async () => {
    const created = await promo.create(adminId, { code: 'FLEX', type: 'fixed', value: '5' });
    const updated = await promo.update(adminId, created.id, { maxUses: 3, value: '7.50' });
    expect(updated.value).toBe('7.50');
    expect(updated.maxUses).toBe(3);

    // Switching a >100 fixed value to percent must fail.
    await promo.update(adminId, created.id, { value: '120' });
    await expect(
      promo.update(adminId, created.id, { type: 'percent' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('deletes a code (audited) and 404s afterwards', async () => {
    const created = await promo.create(adminId, { code: 'GONE', type: 'fixed', value: '5' });
    await promo.remove(adminId, created.id);
    expect(await promo.list()).toHaveLength(0);
    expect(prisma.auditLog.rows.some((a) => a.action === 'promo.delete')).toBe(true);
    await expect(promo.update(adminId, created.id, { value: '1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
