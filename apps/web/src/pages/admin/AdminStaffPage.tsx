import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAdminStaff, useSetUserRole } from '../../features/admin/api';
import { useAuth } from '../../features/auth/useAuth';
import { RoleBadge, UserStatusBadge } from '../../features/admin/badges';
import type { AdminStaffMember, Role } from '@advault/types';

/** Roles a staff member can hold. `user` demotes them out of staff. */
const ROLES: Role[] = ['user', 'support', 'operator', 'manager', 'admin'];

/** Staff & roles (docs/13 §15): list staff with live load; admin changes roles. */
export function AdminStaffPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const staff = useAdminStaff();

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-8">
      <h1 className="mb-1 text-2xl font-bold">{t('admin.staff.title')}</h1>
      <p className="mb-6 text-sm text-text-lo">{t('admin.staff.subtitle')}</p>

      {!isAdmin && (
        <Banner tone="info" className="mb-4">
          {t('admin.staff.readOnly')}
        </Banner>
      )}

      {staff.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : staff.isError ? (
        <>
          <Banner tone="error">{t('admin.staff.error')}</Banner>
          <Button variant="secondary" onClick={() => void staff.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : staff.data!.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="user" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.staff.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                <th className="px-4 py-3 font-semibold">{t('admin.staff.colEmail')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin.staff.colRole')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('admin.staff.colTickets')}
                </th>
                <th className="px-4 py-3 text-right font-semibold">{t('admin.staff.colJobs')}</th>
                {isAdmin && (
                  <th className="px-4 py-3 font-semibold">{t('admin.staff.colChangeRole')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {staff.data!.map((m) => (
                <StaffRow key={m.id} member={m} isAdmin={isAdmin} isSelf={me?.id === m.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StaffRow({
  member,
  isAdmin,
  isSelf,
}: {
  member: AdminStaffMember;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const { t } = useTranslation();
  const [role, setRole] = useState<Role>(member.role);
  const [error, setError] = useState<string | null>(null);
  const setUserRole = useSetUserRole(member.id);

  const save = () => {
    setError(null);
    if (role === member.role) return;
    if (
      !window.confirm(
        t('admin.staff.confirm', { email: member.email, role: t(`admin.roles.${role}`) }),
      )
    )
      return;
    setUserRole.mutate({ role }, { onError: (e) => setError((e as Error).message) });
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <span className="font-semibold text-text-hi">{member.email}</span>
        <UserStatusBadge status={member.status} />
      </td>
      <td className="px-4 py-3">
        <RoleBadge role={member.role} />
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text-lo">
        {member.assignedOpenTickets}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-text-lo">{member.activeWarmingJobs}</td>
      {isAdmin && (
        <td className="px-4 py-3">
          {isSelf ? (
            <span className="text-xs text-text-dim">{t('admin.staff.self')}</span>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                aria-label={t('admin.staff.colChangeRole')}
                className="h-9 rounded-md border border-border bg-surface-2 px-2 text-sm text-text-hi outline-none focus:border-volt"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`admin.roles.${r}`)}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                className="!h-9"
                loading={setUserRole.isPending}
                disabled={role === member.role}
                onClick={save}
              >
                {t('admin.staff.save')}
              </Button>
              {error && <span className="text-xs text-danger">{error}</span>}
            </div>
          )}
        </td>
      )}
    </tr>
  );
}
