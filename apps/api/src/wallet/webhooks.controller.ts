import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { WalletService } from './wallet.service';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Server-to-server acquirer webhooks (docs/backend/openapi.md → Webhooks).
 * No user JWT; authenticity comes from the provider signature over the raw
 * body, which requires the app to be created with `rawBody: true`.
 */
@ApiTags('Webhooks')
@Controller('webhooks/payments')
export class WebhooksController {
  constructor(private readonly wallet: WalletService) {}

  @Public()
  @Post(':provider')
  @HttpCode(200)
  async handleTopUpWebhook(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
    @Body() payload: unknown,
    @Headers('x-signature') signature?: string,
  ): Promise<{ received: true }> {
    return this.wallet.processWebhook(
      provider,
      request.rawBody ?? Buffer.from(''),
      signature,
      payload,
    );
  }
}
