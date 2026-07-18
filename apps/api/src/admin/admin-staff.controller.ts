import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { STAFF } from '../auth/roles';
import { AdminStaffService } from './admin-staff.service';
import type { AdminStaffMember } from '@advault/types';

/**
 * Staff & roles (docs/13 §15). The list is readable by any staff member so it
 * can populate assignment dropdowns (tickets, warming); role changes remain on
 * the admin-only `PATCH /admin/users/:id/role`. No mutations here.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(...STAFF)
@Controller('admin/staff')
export class AdminStaffController {
  constructor(private readonly staff: AdminStaffService) {}

  @Get()
  async list(): Promise<AdminStaffMember[]> {
    return this.staff.list();
  }
}
