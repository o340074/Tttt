import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { useAdminTickets, useCreateTicket } from '../../features/admin/api';
import { TicketPriorityBadge, TicketStatusBadge } from '../../features/admin/badges';
import type { CreateTicketRequest, TicketStatus } from '@advault/types';

const STATUS_FILTERS: (TicketStatus | 'all')[] = ['all', 'open', 'pending', 'resolved', 'closed'];

/** Support ticket queue (docs/13 §13): filters + list + "new ticket" form. */
export function AdminTicketsPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<TicketStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const limit = 20;

  const tickets = useAdminTickets({
    page,
    limit,
    q: q || undefined,
    status: status === 'all' ? undefined : status,
  });
  const totalPages = tickets.data ? Math.max(1, Math.ceil(tickets.data.meta.total / limit)) : 1;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t('admin.tickets.title')}</h1>
          <p className="text-sm text-text-lo">{t('admin.tickets.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setShowForm((s) => !s)}>
          <Icon name="plus" className="!h-4 !w-4" /> {t('admin.tickets.new')}
        </Button>
      </div>

      {showForm && <NewTicketForm onClose={() => setShowForm(false)} />}

      <div className="mb-4 flex items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 !h-4 !w-4 text-text-dim"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(1), setQ(search.trim()))}
            placeholder={t('admin.tickets.searchPlaceholder')}
            aria-label={t('admin.tickets.searchPlaceholder')}
            className="h-11 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text-hi outline-none focus:border-volt"
          />
        </div>
        <Button
          variant="secondary"
          className="!h-11"
          onClick={() => {
            setPage(1);
            setQ(search.trim());
          }}
        >
          {t('admin.tickets.searchBtn')}
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label={t('admin.tickets.colStatus')}>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            aria-pressed={status === s}
            className={`rounded-pill px-3 py-1 text-xs font-semibold transition-colors ${
              status === s
                ? 'bg-volt text-white'
                : 'border border-border bg-surface text-text-lo hover:text-text-hi'
            }`}
          >
            {s === 'all' ? t('admin.tickets.all') : t(`admin.ticketStatuses.${s}`)}
          </button>
        ))}
      </div>

      {tickets.isLoading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : tickets.isError ? (
        <>
          <Banner tone="error">{t('admin.tickets.error')}</Banner>
          <Button variant="secondary" onClick={() => void tickets.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : tickets.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="mail" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('admin.tickets.empty')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-4 py-3 font-semibold">{t('admin.tickets.colNumber')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.tickets.colSubject')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.tickets.colStatus')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.tickets.colPriority')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.tickets.colAssignee')}</th>
                  <th className="px-4 py-3 font-semibold">{t('admin.tickets.colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {tickets.data!.data.map((tk) => (
                  <tr
                    key={tk.id}
                    className="border-b border-border last:border-0 transition-colors hover:bg-surface"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/tickets/${tk.id}`}
                        className="font-display font-bold text-text-hi hover:text-volt-400"
                      >
                        {tk.number}
                      </Link>
                    </td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-text-hi" title={tk.subject}>
                      {tk.lastMessageFromCustomer && (
                        <span
                          className="mr-1.5 inline-flex h-4 items-center gap-1 rounded-pill bg-[rgba(124,125,250,0.16)] px-1.5 align-middle text-[10px] font-bold uppercase tracking-wide text-volt-400"
                          title={t('admin.tickets.newReply')}
                        >
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-volt" />
                          {t('admin.tickets.newReply')}
                        </span>
                      )}
                      {tk.subject}
                      <span className="ml-2 text-xs text-text-dim">· {tk.requester.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      <TicketStatusBadge status={tk.status} />
                    </td>
                    <td className="px-4 py-3">
                      <TicketPriorityBadge priority={tk.priority} />
                    </td>
                    <td className="px-4 py-3 text-text-lo">
                      {tk.assignee?.email ?? (
                        <span className="text-text-dim">{t('admin.tickets.unassigned')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-dim">
                      {new Date(tk.lastReplyAt).toLocaleDateString(i18n.resolvedLanguage, {
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

function NewTicketForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateTicket();
  const [form, setForm] = useState<CreateTicketRequest>({
    subject: '',
    body: '',
    requesterEmail: '',
  });
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!form.subject.trim() || !form.body.trim() || !form.requesterEmail.trim()) {
      return setError(t('admin.tickets.formRequired'));
    }
    create.mutate(form, {
      onSuccess: onClose,
      onError: (e) => setError((e as Error).message || t('admin.tickets.formError')),
    });
  };

  const field =
    'h-11 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt';

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-hi">{t('admin.tickets.newHeading')}</h2>
      {error && (
        <Banner tone="error" className="mb-3">
          {error}
        </Banner>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={form.requesterEmail}
          onChange={(e) => setForm({ ...form, requesterEmail: e.target.value })}
          placeholder={t('admin.tickets.requesterEmail')}
          aria-label={t('admin.tickets.requesterEmail')}
          className={field}
        />
        <input
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder={t('admin.tickets.subject')}
          aria-label={t('admin.tickets.subject')}
          className={field}
        />
      </div>
      <textarea
        value={form.body}
        onChange={(e) => setForm({ ...form, body: e.target.value })}
        placeholder={t('admin.tickets.message')}
        aria-label={t('admin.tickets.message')}
        rows={3}
        className="mt-3 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-hi outline-none focus:border-volt"
      />
      <div className="mt-3 flex gap-2">
        <Button variant="primary" loading={create.isPending} onClick={submit}>
          {t('admin.tickets.create')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('admin.cancel')}
        </Button>
      </div>
    </div>
  );
}
