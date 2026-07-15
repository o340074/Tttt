import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminStaffMember, Role, UserStatus } from '@advault/types';

/** Active warming statuses that count toward an operator's live load. */
const ACTIVE_JOB_STATUSES = ['assigned', 'in_progress', 'qc', 'ready', 'on_hold'] as const;

/**
 * Staff & roles read surface (docs/13 §15). Lists non-customer accounts with
 * their live workload (open tickets + active warming jobs) so managers can see
 * who is available before (re)assigning. Role changes go through the existing
 * admin-only `PATCH /admin/users/:id/role` — this service never mutates.
 */
@Injectable()
export class AdminStaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AdminStaffMember[]> {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: ['support', 'operator', 'manager', 'admin'] } },
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
      select: { id: true, email: true, role: true, status: true, createdAt: true },
    });

    const [ticketGroups, jobGroups] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['assigneeId'],
        where: { assigneeId: { not: null }, status: { in: ['open', 'pending'] } },
        _count: { _all: true },
      }),
      this.prisma.warmingJob.groupBy({
        by: ['assignedTo'],
        where: { assignedTo: { not: null }, status: { in: [...ACTIVE_JOB_STATUSES] } },
        _count: { _all: true },
      }),
    ]);

    const openTicketsBy = new Map(ticketGroups.map((g) => [g.assigneeId, g._count._all]));
    const activeJobsBy = new Map(jobGroups.map((g) => [g.assignedTo, g._count._all]));

    return staff.map(
      (u): AdminStaffMember => ({
        id: u.id,
        email: u.email,
        role: u.role as Role,
        status: u.status as UserStatus,
        assignedOpenTickets: openTicketsBy.get(u.id) ?? 0,
        activeWarmingJobs: activeJobsBy.get(u.id) ?? 0,
        createdAt: u.createdAt.toISOString(),
      }),
    );
  }
}
