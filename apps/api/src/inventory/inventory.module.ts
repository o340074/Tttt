import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * Proxy / Octo inventory (E7). CryptoService and AuditService are global;
 * PrismaService is global too. Exports InventoryService so the warming
 * operator surface can show the resources bound to a job.
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
