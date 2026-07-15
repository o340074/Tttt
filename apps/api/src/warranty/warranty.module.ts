import { Module } from '@nestjs/common';
import { WarrantyController } from './warranty.controller';
import { WarrantyService } from './warranty.service';

/** Buyer warranty portal (E10). PrismaService, AuditService are global. */
@Module({
  controllers: [WarrantyController],
  providers: [WarrantyService],
})
export class WarrantyModule {}
