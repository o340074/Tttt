import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser, Roles } from '../auth/decorators';
import { AdminService } from './admin.service';
import type { StockImportReport } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';
import type { Request } from 'express';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

@ApiTags('Admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * Import stock lines — JSON `{ items: string[] }` or a raw text/plain CSV/TXT.
   * Payload is encrypted server-side; duplicates and blanks are skipped.
   */
  @Post('products/:id/variants/:variantId/stock/import')
  @HttpCode(201)
  async importStock(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) productId: string,
    @Param('variantId', uuidPipe) variantId: string,
    @Req() req: Request,
  ): Promise<StockImportReport> {
    // JSON → parsed object; text/plain → string (see textBodyParser in app.setup).
    return this.admin.importStock(user.sub, productId, variantId, req.body);
  }
}
