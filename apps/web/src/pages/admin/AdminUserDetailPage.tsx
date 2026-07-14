import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAdminUser, useSetUserBlocked, useSetUserRole } from '../../features/admin/api';
import { useAuth } from '../../features/auth/useAuth';
import { OrderStatusBadge, RoleBadge, UserStatusBadge } from '../../features/admin/badges';
import { formatMoney } from '../../features/catalog/format';
import type { AdminUserDetail, Role } from '@advault/types';

const ROLES: Role[] = ['user', 'support', 'operator', 'manager', 'admin'];

/** Admin user card (docs/13 §10): profile, orders, ledger, block + role actions. */
export function AdminUserDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const user = useAdminUser(id);

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-8 md:px-8">
      <Link
        to="/admin/users"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-text-lo hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-3.5 !w-3.5" /> {t('admin.users.back')}
      </Link>

      {user.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface" aria-hidden />
      ) : user.isError ? (
        <>
          <Banner tone="error">{t('admin.users.detailError')}</Banner>
          <Button variant="secondary" onClick={() => void user.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : (
        <UserCard data={user.data!} />
      )}
    </div>
  );
}

function UserCard({ data }: { data: AdminUserDetail }) {
  const { t, i18n } = useTranslation();
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const isSelf = me?.id === data.id;
  const reconciled = data.ledgerBalance === data.balance;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-text-hi">{data.email}</h1>
            <UserStatusBadge status={data.status} />
            <RoleBadge role={data.role} />
          </div>
          <p className="mt-1 text-sm text-text-dim">
            {t('admin.users.colJoined')}:{' '}
            {new Date(data.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
              dateStyle: 'medium',
            })}
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold tabular-nums text-text-hi">
            {formatMoney(data.balance, data.currency)}
          </div>
          <div className={`text-xs ${reconciled ? 'text-text-dim' : 'text-danger'}`}>
            {t('admin.users.ledgerBalance')}: {formatMoney(data.ledgerBalance, data.currency)} ·{' '}
            {reconciled ? t('admin.users.reconciled') : t('admin.users.discrepancy')}
          </div>
        </div>
      </div>

      <ActionsCard data={data} isAdmin={isAdmin} isSelf={isSelf} />

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-text-dim">
        {t('admin.users.recentOrders')}
      </h2>
      {data.recentOrders.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-8 text-center text-text-lo">
          {t('admin.users.noOrders')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/orders/${o.id}`}
                      className="font-display font-bold text-text-hi hover:text-volt-400"
                    >
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-text-hi">
                    {formatMoney(o.total, data.currency)}
                  </td>
                  <td className="px-4 py-3 text-text-dim">
                    {new Date(o.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
                      dateStyle: 'medium',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ActionsCard({
  data,
  isAdmin,
  isSelf,
}: {
  data: AdminUserDetail;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [role, setRole] = useState<Role>(data.role);
  const [error, setError] = useState<string | null>(null);
  const setBlocked = useSetUserBlocked(data.id);
  const setUserRole = useSetUserRole(data.id);

  const blocked = data.status === 'blocked';

  const doBlock = () => {
    setError(null);
    if (!reason.trim()) return setError(t('admin.users.reasonRequired'));
    const confirmKey = blocked ? 'admin.users.unblockConfirm' : 'admin.users.blockConfirm';
    if (!window.confirm(t(confirmKey))) return;
    setBlocked.mutate(
      { blocked: !blocked, reason: reason.trim() },
      { onError: () => setError(t('admin.users.actionError')), onSuccess: () => setReason('') },
    );
  };

  const doRole = () => {
    setError(null);
    if (role === data.role) return;
    setUserRole.mutate(
      { role, reason: reason.trim() || undefined },
      { onError: () => setError(t('admin.users.actionError')) },
    );
  };

  if (isSelf) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-dim">
        {t('admin.users.roleAdminOnly')}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {error && (
        <Banner tone="error" className="mb-3">
          {error}
        </Banner>
      )}
      <label htmlFor="user-reason" className="mb-1 block text-xs font-semibold text-text-lo">
        {t('admin.users.reason')}
      </label>
      <input
        id="user-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('admin.users.reasonPlaceholder')}
        className="mb-4 h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt"
      />

      <div className="flex flex-wrap items-end gap-3">
        <Button
          variant={blocked ? 'secondary' : 'ghost'}
          className={
            blocked ? '' : '!border-danger/50 !text-danger hover:!bg-[rgba(255,77,109,0.08)]'
          }
          loading={setBlocked.isPending}
          onClick={doBlock}
        >
          <Icon name={blocked ? 'refresh' : 'lock'} className="!h-4 !w-4" />
          {blocked ? t('admin.users.unblock') : t('admin.users.block')}
        </Button>

        {isAdmin ? (
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="user-role" className="mb-1 block text-xs font-semibold text-text-lo">
                {t('admin.users.changeRole')}
              </label>
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="h-11 rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`admin.roles.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="secondary"
              loading={setUserRole.isPending}
              disabled={role === data.role}
              onClick={doRole}
            >
              {t('admin.users.save')}
            </Button>
          </div>
        ) : (
          <span className="self-center text-xs text-text-dim">
            {t('admin.users.roleAdminOnly')}
          </span>
        )}
      </div>
    </div>
  );
}
