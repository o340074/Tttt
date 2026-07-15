import { useTranslation } from 'react-i18next';
import type { WarrantyClaimStatus } from '@advault/types';

const PILL = 'inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-semibold';

const STYLES: Record<WarrantyClaimStatus, string> = {
  requested: 'bg-[rgba(245,183,64,0.14)] text-warning',
  approved: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  reworking: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  rejected: 'bg-[rgba(255,77,109,0.14)] text-danger',
  replaced: 'bg-[rgba(34,211,238,0.14)] text-beam',
  refunded: 'bg-[rgba(43,217,166,0.14)] text-success',
};

/** Warranty claim status pill (labels under the `warranty.statuses.*` namespace). */
export function WarrantyStatusPill({ status }: { status: WarrantyClaimStatus }) {
  const { t } = useTranslation();
  return <span className={`${PILL} ${STYLES[status]}`}>{t(`warranty.statuses.${status}`)}</span>;
}
