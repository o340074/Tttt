import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAdminUsers } from '../../features/admin/api';
import { RoleBadge, UserStatusBadge } from '../../features/admin/badges';
import { formatMoney } from '../../features/catalog/format';
import type { Role, UserStatus } from '@advault/types';

const STATUS_FILTERS: (UserStatus | 'all')[] = ['all', 'active', 'blocked'];
const ROLE_FILTERS: (Role | 'all')[] = ['all', 'user', 'support', 'operator', 'manager', 'admin'];

/** Admin users table (docs/13 §10): search + status/role filters + pagination. */
export function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<UserStatus | 'all'>('all');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const limit = 20;

  const users = useAdminUsers({
    page,
    limit,
    q: q || undefined,
    status: status === 'all' ? undefined : status,
    role: role === 'all' ? undefined : role,
  });
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.meta.total / limit)) : 1;

  const applySearch = () => {
    setPage(1);
    setQ(search.trim());
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-8">
      <h1 className="mb-1 text-2xl font-bold">{t('admin.users.title')}</h1>
      <p className="mb-6 text-sm text-text-lo">{t('admin.users.subtitle')}</p>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 !h-4 !w-4 text-text-dim"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder={t('admin.users.searchPlaceholder')}
            aria-label={t('admin.users.searchPlaceholder')}
            className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text-hi outline-none focus:border-volt"
          />
        </div>
        <Button variant="secondary" className="!h-11" onClick={applySearch}>
          {t('admin.users.searchBtn')}
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap gap-4">
        <FilterRow
          label={t('admin.users.colStatus')}
          options={STATUS_FILTERS}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          render={(v) => (v === 'all' ? t('admin.users.all') : t(`admin.userStatuses.${v}`))}
        />
        <FilterRow
          label={t('admin.users.colRole')}
          options={ROLE_FILTERS}
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          render={(v) => (v === 'all' ? t('admin.users.all') : t(`admin.roles.${v}`))}
        />
      </div>

      {users.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : users.isError ? (
        <>
          <Banner tone="error">{t('admin.users.error')}</Banner>
          <Button variant="secondary" onClick={() => void users.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : users.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="user" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.users.empty')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-semibold">{t('admin.users.colEmail')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.users.colRole')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.users.colStatus')}</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {t('admin.users.colBalance')}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    {t('admin.users.colOrders')}
                  </th>
                  <th className="px-4 py-3 font-semibold">{t('admin.users.colJoined')}</th>
                </tr>
              </thead>
              <tbody>
                {users.data!.data.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-0 transition-colors hover:bg-surface"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/users/${u.id}`}
                        className="font-semibold text-text-hi hover:text-volt-400"
                      >
                        {u.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-4 py-3">
                      <UserStatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-hi">
                      {formatMoney(u.balance, u.currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-lo">
                      {u.orderCount}
                    </td>
                    <td className="px-4 py-3 text-text-dim">
                      {new Date(u.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
                        dateStyle: 'medium',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-5 flex items-center justify-center gap-3"
              aria-label={t('admin.pagination')}
            >
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="arrow-left" className="!h-3 !w-3" /> {t('admin.prev')}
              </Button>
              <span className="text-[13px] tabular-nums text-text-lo">
                {t('admin.page', { page, total: totalPages })}
              </span>
              <Button
                variant="ghost"
                className="!h-9 !px-3 text-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('admin.next')} <Icon name="arrow-right" className="!h-3 !w-3" />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-text-dim">{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
            value === o
              ? 'bg-volt text-white'
              : 'border border-border bg-surface text-text-lo hover:text-text-hi'
          }`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}
