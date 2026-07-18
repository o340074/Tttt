import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { TicketStatusPill } from '../features/tickets/TicketStatusPill';
import { useMyTicket, useReplyTicket } from '../features/tickets/api';
import { ApiRequestError } from '../lib/api';
import type { TicketAuthorRole, TicketMessageView } from '@advault/types';

const ROLE_ICON: Record<TicketAuthorRole, 'user' | 'shield' | 'info'> = {
  customer: 'user',
  staff: 'shield',
  system: 'info',
};

export function TicketPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const ticket = useMyTicket(id);
  const reply = useReplyTicket(id);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const closed = ticket.data?.status === 'closed';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (body.trim().length < 1) return;
    reply.mutate(
      { body: body.trim() },
      {
        onSuccess: () => setBody(''),
        onError: (err) =>
          setError(err instanceof ApiRequestError ? err.message : t('support.replyError')),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-10 md:px-6">
      <Link
        to="/support"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-text-lo transition-colors hover:text-text-hi"
      >
        <Icon name="arrow-left" className="!h-3.5 !w-3.5" /> {t('support.back')}
      </Link>

      {ticket.isLoading ? (
        <div className="space-y-3" aria-hidden>
          <div className="h-8 w-1/2 animate-pulse rounded bg-surface" />
          <div className="h-24 animate-pulse rounded-lg bg-surface" />
          <div className="h-24 animate-pulse rounded-lg bg-surface" />
        </div>
      ) : ticket.isError ? (
        <>
          <Banner tone="error">{t('support.notFound')}</Banner>
          <Link to="/support" className="text-sm text-volt hover:text-text-hi">
            {t('support.back')}
          </Link>
        </>
      ) : (
        <>
          <header className="mb-6">
            <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold md:text-2xl">{ticket.data!.subject}</h1>
              <TicketStatusPill status={ticket.data!.status} />
            </div>
            <p className="text-sm text-text-lo">
              {ticket.data!.number}
              {ticket.data!.orderNumber ? ` · ${ticket.data!.orderNumber}` : ''}
            </p>
          </header>

          <ol className="mb-6 flex flex-col gap-3">
            {ticket.data!.messages.map((m) => (
              <Message key={m.id} message={m} locale={i18n.resolvedLanguage} />
            ))}
          </ol>

          {closed ? (
            <Banner tone="info">{t('support.closedNote')}</Banner>
          ) : (
            <form
              onSubmit={submit}
              className="rounded-xl border border-border bg-surface p-5 shadow-2"
            >
              {error && (
                <Banner tone="error" className="mb-4">
                  {error}
                </Banner>
              )}
              <label className="mb-1 block text-sm font-semibold text-text-hi" htmlFor="reply-body">
                {t('support.reply')}
              </label>
              <textarea
                id="reply-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder={t('support.replyPlaceholder')}
                className="mb-4 w-full resize-y rounded-md border border-border bg-void px-3 py-2.5 text-sm text-text-hi outline-none transition-colors focus:border-volt"
              />
              <Button type="submit" disabled={reply.isPending || body.trim().length === 0}>
                {reply.isPending ? t('support.sending') : t('support.send')}
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function Message({ message, locale }: { message: TicketMessageView; locale?: string }) {
  const { t } = useTranslation();
  const isCustomer = message.authorRole === 'customer';
  return (
    <li
      className={`rounded-lg border px-4 py-3 ${
        isCustomer ? 'border-volt/40 bg-volt/5' : 'border-border bg-surface'
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2 text-xs text-text-lo">
        <Icon name={ROLE_ICON[message.authorRole]} className="!h-3.5 !w-3.5" />
        <span className="font-semibold text-text-hi">
          {t(`support.authors.${message.authorRole}`)}
        </span>
        <span className="text-text-dim">
          {new Date(message.createdAt).toLocaleString(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-text">{message.body}</p>
    </li>
  );
}
