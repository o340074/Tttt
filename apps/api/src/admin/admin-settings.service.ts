import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/api-exception';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { applyUpdate, buildSettings, SETTING_KEYS } from './settings.logic';
import type { Env } from '../config/env';
import type { ShopSettings, UpdateSettingsRequest } from '@advault/types';

/**
 * Shop settings (docs/13 §17) over the key-value Setting store. A typed layer
 * (settings.logic) maps known keys to typed sections and applies defaults.
 * Integration flags are derived read-only from env — secrets (crypto/KMS/Octo)
 * are NEVER stored or returned here. Admin-only; every save is audited.
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async get(): Promise<ShopSettings> {
    const rows = await this.readRows();
    return buildSettings(rows, this.integrationFlags());
  }

  async update(actorId: string, patch: UpdateSettingsRequest): Promise<ShopSettings> {
    const rows = await this.readRows();
    const result = applyUpdate(rows, patch);
    if (result.error) throw new ApiException('VALIDATION_ERROR', result.error, 400);

    await this.prisma.$transaction(async (tx) => {
      await this.upsert(tx, SETTING_KEYS.store, result.store, actorId);
      await this.upsert(tx, SETTING_KEYS.notifications, result.notifications, actorId);
    });

    await this.audit.record({
      actorId,
      action: 'settings.update',
      entity: 'Setting',
      // Non-secret keys only; templates/store config are safe to record.
      diff: { keys: Object.keys(patch) },
    });
    return buildSettings(await this.readRows(), this.integrationFlags());
  }

  // ---------- Internals ----------

  private async readRows(): Promise<Record<string, unknown>> {
    const stored = await this.prisma.setting.findMany();
    const rows: Record<string, unknown> = {};
    for (const s of stored) rows[s.key] = s.value;
    return rows;
  }

  private upsert(tx: Prisma.TransactionClient, key: string, value: unknown, actorId: string) {
    const data = { value: value as object, updatedBy: actorId };
    return tx.setting.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
  }

  private integrationFlags(): ShopSettings['integrations'] {
    const webhook = this.config.get('PAYMENT_WEBHOOK_SECRET', { infer: true });
    const encKey = this.config.get('PAYLOAD_ENCRYPTION_KEY', { infer: true });
    const configured = (v: string | undefined): boolean => Boolean(v) && !v!.includes('change-me');
    return {
      cryptoAcquiringConfigured: configured(webhook),
      // Octo integration is a future placeholder — never auto-true.
      octoApiConfigured: false,
      kmsConfigured: Boolean(encKey) && !encKey!.includes('YWR2YXVsdC1kZXY'),
    };
  }
}
