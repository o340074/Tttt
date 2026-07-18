import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { ApiException } from '../common/api-exception';
import { CurrentUser } from '../auth/decorators';
import { CreateTopUpDto, TransactionsQueryDto } from './dto/wallet.dto';
import { WalletService } from './wallet.service';
import type { LedgerEntry, Paginated, TopUp, Wallet } from '@advault/types';
import type { AccessPayload } from '../auth/token.service';

const uuidPipe = new ParseUUIDPipe({
  exceptionFactory: () => new ApiException('VALIDATION_ERROR', 'id must be a UUID', 400),
});

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  async getWallet(@CurrentUser() user: AccessPayload): Promise<Wallet> {
    return this.wallet.getWallet(user.sub);
  }

  @Get('transactions')
  async listTransactions(
    @CurrentUser() user: AccessPayload,
    @Query() query: TransactionsQueryDto,
  ): Promise<Paginated<LedgerEntry>> {
    return this.wallet.listTransactions(user.sub, query.page, query.limit);
  }

  @Post('topups')
  @HttpCode(201)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async createTopUp(
    @CurrentUser() user: AccessPayload,
    @Body() dto: CreateTopUpDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TopUp> {
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new ApiException('VALIDATION_ERROR', 'Idempotency-Key header is required', 400, {
        fields: { 'Idempotency-Key': ['required header, at most 255 characters'] },
      });
    }
    return this.wallet.createTopUp(user.sub, dto, idempotencyKey);
  }

  @Get('topups/:id')
  async getTopUp(
    @CurrentUser() user: AccessPayload,
    @Param('id', uuidPipe) id: string,
  ): Promise<TopUp> {
    return this.wallet.getTopUp(user.sub, id);
  }
}
