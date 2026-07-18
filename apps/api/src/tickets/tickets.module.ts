import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

/** Buyer support portal (E9). PrismaService, AuditService are global. */
@Module({
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
