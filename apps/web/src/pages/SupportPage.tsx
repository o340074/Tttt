import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { TicketStatusPill } from '../features/tickets/TicketStatusPill';
import { useCreateTicket, useMyTickets } from '../features/tickets/api';
import { ApiRequestError } from '../lib/api';

/** Buyer support portal: ticket list + a "new ticket" composer (E9). */
export function SupportPage() {
  const { t, i18n } = useTranslation();
  const tickets = useMyTickets();
  const create = useCreateTicket();
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (subject.trim().length < 3 || body.trim().length < 1) {
      setError(t('support.validation'));
      return;
    }
    create.mutate(
      { subject: subject.trim(), body: body.trim() },
      {
        onSuccess: () => {
          setSubject('');
          setBody('');
          setShowForm(false);
        },
        onError: (err) => {
          setError(err instanceof ApiRequestError ? err.message : t('support.createError'));
        },
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[840px] px-4 py-10 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{t('support.title')}</h1>
          <p className="mt-1 text-sm text-text-lo">{t('support.subtitle')}</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <Icon name="plus" className="!h-4 !w-4" /> {t('support.new')}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="mb-6 rounded-xl border border-border bg-surface p-5 shadow-2"
        >
          <h2 className="mb-4 font-display text-lg font-bold text-text-hi">{t('support.new')}</h2>
          {error && (
            <Banner tone="error" className="mb-4">
              {error}
            </Banner>
          )}
          <label className="mb-1 block text-sm font-semibold text-text-hi" htmlFor="tk-subject">
            {t('support.subject')}
          </label>
          <input
            id="tk-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={160}
            className="mb-4 w-full rounded-md border border-border bg-void px-3 py-2.5 text-sm text-text-hi outline-none transition-colors focus:border-volt"
          />
          <label className="mb-1 block text-sm font-semibold text-text-hi" htmlFor="tk-body">
            {t('support.message')}
          </label>
          <textarea
            id="tk-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={4000}
            className="mb-4 w-full resize-y rounded-md border border-border bg-void px-3 py-2.5 text-sm text-text-hi outline-none transition-colors focus:border-volt"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('support.sending') : t('support.submit')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              {t('support.cancel')}
            </Button>
          </div>
        </form>
      )}

      {tickets.isLoading ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : tickets.isError ? (
        <>
          <Banner tone="error">{t('support.error')}</Banner>
          <Button variant="secondary" onClick={() => void tickets.refetch()}>
            {t('support.retry')}
          </Button>
        </>
      ) : tickets.data!.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-14 text-center">
          <Icon name="ticket" className="mb-3 !h-10 !w-10 opacity-70" />
          <p className="text-text-lo">{t('support.empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {tickets.data!.data.map((tk) => (
            <li key={tk.id}>
              <Link
                to={`/support/${tk.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-5 py-4 shadow-2 transition-all duration-[140ms] hover:-translate-y-px hover:border-volt"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2.5">
                    <span className="font-display text-[15px] font-bold text-text-hi">
                      {tk.number}
                    </span>
                    <TicketStatusPill status={tk.status} />
                  </div>
                  <div className="truncate text-[14px] text-text-hi" title={tk.subject}>
                    {tk.subject}
                  </div>
                  <div className="text-[13px] text-text-lo">
                    {t('support.messages', { count: tk.messageCount })} ·{' '}
                    {new Date(tk.lastReplyAt).toLocaleString(i18n.resolvedLanguage, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {tk.orderNumber ? ` · ${tk.orderNumber}` : ''}
                  </div>
                </div>
                <Icon name="arrow-right" className="!h-4 !w-4 text-text-dim" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
