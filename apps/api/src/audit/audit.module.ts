import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Global: delivery access and admin stock import both write audit entries. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
