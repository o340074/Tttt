import { useTranslation } from 'react-i18next';
import type { TicketStatus } from '@advault/types';

const PILL = 'inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-semibold';

const STYLES: Record<TicketStatus, string> = {
  open: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  pending: 'bg-[rgba(245,183,64,0.14)] text-warning',
  resolved: 'bg-[rgba(34,211,238,0.14)] text-beam',
  closed: 'bg-[rgba(43,217,166,0.14)] text-success',
};

/** Buyer-facing ticket status pill (labels under the `support.*` namespace). */
export function TicketStatusPill({ status }: { status: TicketStatus }) {
  const { t } = useTranslation();
  return <span className={`${PILL} ${STYLES[status]}`}>{t(`support.statuses.${status}`)}</span>;
}
