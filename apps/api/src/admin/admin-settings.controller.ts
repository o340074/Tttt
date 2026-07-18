import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators';
import { ADMIN_ONLY } from '../auth/roles';
import { AdminSettingsService } from './admin-settings.service';
import { UpdateSettingsDto } from './dto/admin-settings.dto';
import type { ShopSettings } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

/**
 * Settings / Integrations (docs/13 §17). Admin-only: shop config, languages and
 * notification templates. Secrets (crypto/KMS/Octo) are never stored or exposed
 * here — only read-only "configured" flags. Every save is audited.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...ADMIN_ONLY)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  async get(): Promise<ShopSettings> {
    return this.settings.get();
  }

  @Put()
  async update(
    @CurrentUser() actor: AccessPayload,
    @Body() dto: UpdateSettingsDto,
  ): Promise<ShopSettings> {
    return this.settings.update(actor.sub, dto);
  }
}
