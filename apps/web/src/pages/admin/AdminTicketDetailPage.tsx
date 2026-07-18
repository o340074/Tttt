import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../../components/ui/Banner';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import {
  useAdminStaff,
  useAdminTicket,
  useAddTicketMessage,
  useUpdateTicket,
} from '../../features/admin/api';
import { TicketPriorityBadge, TicketStatusBadge } from '../../features/admin/badges';
import type { AdminTicketDetail, TicketPriority, TicketStatus } from '@advault/types';

const STATUSES: TicketStatus[] = ['open', 'pending', 'resolved', 'closed'];
const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];

/** Ticket thread + support actions (docs/13 §13): reply/note, assign, status. */
export function AdminTicketDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const ticket = useAdminTicket(id);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 md:px-8">
      <Link
        to="/admin/tickets"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-text-lo hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-3.5 !w-3.5" /> {t('admin.tickets.back')}
      </Link>

      {ticket.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface" aria-hidden />
      ) : ticket.isError ? (
        <>
          <Banner tone="error">{t('admin.tickets.detailError')}</Banner>
          <Button variant="secondary" onClick={() => void ticket.refetch()}>
            {t('admin.retry')}
          </Button>
        </>
      ) : (
        <TicketView data={ticket.data!} />
      )}
    </div>
  );
}

function TicketView({ data }: { data: AdminTicketDetail }) {
  const { t, i18n } = useTranslation();

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-text-hi">{data.subject}</h1>
            <TicketStatusBadge status={data.status} />
            <TicketPriorityBadge priority={data.priority} />
          </div>
          <p className="mt-1 text-sm text-text-dim">
            {data.number} · {data.requester.email}
            {data.orderNumber && (
              <>
                {' · '}
                <Link
                  to={`/admin/orders/${data.orderId}`}
                  className="text-volt-400 hover:underline"
                >
                  {data.orderNumber}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <TicketActions data={data} />

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-text-dim">
        {t('admin.tickets.thread')}
      </h2>
      <div className="space-y-3">
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-4 ${
              m.isInternal
                ? 'border-warning/40 bg-[rgba(245,183,64,0.06)]'
                : 'border-border bg-surface'
            }`}
          >
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-text-hi">
                {m.authorEmail ?? t('admin.tickets.system')}
                {m.isInternal && (
                  <span className="ml-2 rounded-pill bg-[rgba(245,183,64,0.14)] px-2 py-0.5 text-[10px] uppercase text-warning">
                    {t('admin.tickets.internal')}
                  </span>
                )}
              </span>
              <span className="text-text-dim">
                {new Date(m.createdAt).toLocaleString(i18n.resolvedLanguage, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-text-lo">{m.body}</p>
          </div>
        ))}
      </div>

      {data.status !== 'closed' && <ReplyBox ticketId={data.id} />}
    </>
  );
}

function TicketActions({ data }: { data: AdminTicketDetail }) {
  const { t } = useTranslation();
  const staff = useAdminStaff();
  const update = useUpdateTicket(data.id);
  const [error, setError] = useState<string | null>(null);

  const run = (body: Parameters<typeof update.mutate>[0]) => {
    setError(null);
    update.mutate(body, { onError: (e) => setError((e as Error).message) });
  };

  const control =
    'h-10 rounded-md border border-border bg-surface-2 px-3 text-sm text-text-hi outline-none focus:border-volt';

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {error && (
        <Banner tone="error" className="mb-3">
          {error}
        </Banner>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-lo">{t('admin.tickets.colStatus')}</span>
          <select
            className={control}
            value={data.status}
            onChange={(e) => run({ status: e.target.value as TicketStatus })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.ticketStatuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-lo">
            {t('admin.tickets.colPriority')}
          </span>
          <select
            className={control}
            value={data.priority}
            onChange={(e) => run({ priority: e.target.value as TicketPriority })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`admin.ticketPriorities.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-lo">
            {t('admin.tickets.colAssignee')}
          </span>
          <select
            className={control}
            value={data.assignee?.id ?? ''}
            onChange={(e) => run({ assigneeId: e.target.value || null })}
          >
            <option value="">{t('admin.tickets.unassigned')}</option>
            {(staff.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.email}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function ReplyBox({ ticketId }: { ticketId: string }) {
  const { t } = useTranslation();
  const add = useAddTicketMessage(ticketId);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!body.trim()) return;
    add.mutate(
      { body: body.trim(), isInternal: internal },
      { onSuccess: () => setBody(''), onError: (e) => setError((e as Error).message) },
    );
  };

  return (
    <div className="mt-5 rounded-xl border border-border bg-surface p-4">
      {error && (
        <Banner tone="error" className="mb-3">
          {error}
        </Banner>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          internal ? t('admin.tickets.notePlaceholder') : t('admin.tickets.replyPlaceholder')
        }
        aria-label={t('admin.tickets.reply')}
        rows={3}
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text-hi outline-none focus:border-volt"
      />
      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-text-lo">
          <input
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="h-4 w-4 accent-volt"
          />
          {t('admin.tickets.internalNote')}
        </label>
        <Button variant="primary" loading={add.isPending} onClick={submit}>
          {internal ? t('admin.tickets.addNote') : t('admin.tickets.sendReply')}
        </Button>
      </div>
    </div>
  );
}
