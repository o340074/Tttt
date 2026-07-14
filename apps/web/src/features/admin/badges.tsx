import { useTranslation } from 'react-i18next';
import type {
  OctoProfileStatus,
  OrderItemDeliveryStatus,
  OrderStatus,
  ProxyStatus,
  Role,
  UserStatus,
  WarmingJobStatus,
} from '@advault/types';

const PILL = 'inline-flex h-6 items-center rounded-pill px-2.5 text-xs font-semibold';

const ORDER_STATUS: Record<OrderStatus, string> = {
  pending: 'bg-[rgba(245,183,64,0.14)] text-warning',
  paid: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  partially_delivered: 'bg-[rgba(34,211,238,0.14)] text-beam',
  delivered: 'bg-[rgba(43,217,166,0.14)] text-success',
  cancelled: 'bg-[rgba(255,77,109,0.14)] text-danger',
  refunded: 'bg-[rgba(255,77,109,0.14)] text-danger',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`${PILL} ${ORDER_STATUS[status]}`}>{t(`orders.statuses.${status}`)}</span>
  );
}

const WARM_STATUS: Record<WarmingJobStatus, string> = {
  queued: 'bg-[rgba(245,183,64,0.14)] text-warning',
  assigned: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  in_progress: 'bg-[rgba(34,211,238,0.14)] text-beam',
  qc: 'bg-[rgba(34,211,238,0.14)] text-beam',
  ready: 'bg-[rgba(43,217,166,0.14)] text-success',
  delivered: 'bg-[rgba(43,217,166,0.14)] text-success',
  on_hold: 'bg-[rgba(245,183,64,0.14)] text-warning',
  failed: 'bg-[rgba(255,77,109,0.14)] text-danger',
  refunded: 'bg-[rgba(255,77,109,0.14)] text-danger',
};

export function WarmingStatusBadge({ status }: { status: WarmingJobStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`${PILL} ${WARM_STATUS[status]}`}>{t(`admin.warmStatuses.${status}`)}</span>
  );
}

const DELIVERY_STATUS: Record<OrderItemDeliveryStatus, string> = {
  pending: 'bg-surface-2 text-text-lo',
  awaiting_manual: 'bg-[rgba(245,183,64,0.14)] text-warning',
  queued: 'bg-[rgba(245,183,64,0.14)] text-warning',
  assigned: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  in_progress: 'bg-[rgba(34,211,238,0.14)] text-beam',
  qc: 'bg-[rgba(34,211,238,0.14)] text-beam',
  ready: 'bg-[rgba(43,217,166,0.14)] text-success',
  on_hold: 'bg-[rgba(245,183,64,0.14)] text-warning',
  failed: 'bg-[rgba(255,77,109,0.14)] text-danger',
  delivered: 'bg-[rgba(43,217,166,0.14)] text-success',
  replaced: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  refunded: 'bg-[rgba(255,77,109,0.14)] text-danger',
};

export function DeliveryStatusBadge({ status }: { status: OrderItemDeliveryStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`${PILL} ${DELIVERY_STATUS[status]}`}>
      {t(`orders.deliveryStatuses.${status}`)}
    </span>
  );
}

const PROXY_STATUS: Record<ProxyStatus, string> = {
  available: 'bg-[rgba(43,217,166,0.14)] text-success',
  assigned: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  expired: 'bg-[rgba(245,183,64,0.14)] text-warning',
  disabled: 'bg-[rgba(255,77,109,0.14)] text-danger',
};

export function ProxyStatusBadge({ status }: { status: ProxyStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`${PILL} ${PROXY_STATUS[status]}`}>{t(`admin.proxyStatuses.${status}`)}</span>
  );
}

const OCTO_STATUS: Record<OctoProfileStatus, string> = {
  draft: 'bg-surface-2 text-text-lo',
  ready: 'bg-[rgba(43,217,166,0.14)] text-success',
  delivered: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
};

export function OctoStatusBadge({ status }: { status: OctoProfileStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`${PILL} ${OCTO_STATUS[status]}`}>{t(`admin.octoStatuses.${status}`)}</span>
  );
}

const USER_STATUS: Record<UserStatus, string> = {
  active: 'bg-[rgba(43,217,166,0.14)] text-success',
  blocked: 'bg-[rgba(255,77,109,0.14)] text-danger',
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`${PILL} ${USER_STATUS[status]}`}>{t(`admin.userStatuses.${status}`)}</span>
  );
}

const ROLE_STYLE: Record<Role, string> = {
  user: 'bg-surface-2 text-text-lo',
  support: 'bg-[rgba(34,211,238,0.14)] text-beam',
  operator: 'bg-[rgba(124,125,250,0.16)] text-volt-400',
  manager: 'bg-[rgba(245,183,64,0.14)] text-warning',
  admin: 'bg-[rgba(43,217,166,0.14)] text-success',
};

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useTranslation();
  return <span className={`${PILL} ${ROLE_STYLE[role]}`}>{t(`admin.roles.${role}`)}</span>;
}
