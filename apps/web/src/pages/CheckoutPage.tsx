import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Banner } from '../components/ui/Banner';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { errorKey } from '../features/auth/errors';
import { useAuth } from '../features/auth/useAuth';
import {
  useApplyPromo,
  useCart,
  useCheckout,
  useRemoveCartItem,
  useUpdateCartItem,
} from '../features/cart/api';
import { catalogIcon, formatMoney } from '../features/catalog/format';
import { apiFetch, ApiRequestError } from '../lib/api';
import type { Cart, CartItem, Order, PromoCodePublic, User } from '@advault/types';
import type { IconName } from '../components/ui/Icon';

const MAX_QUANTITY = 99;

/** Money string ↔ integer cents; the server (Decimal) stays the source of truth. */
function toCents(money: string): number {
  return Math.round(Number(money) * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Mirrors PromoService.discountFor: percent of the subtotal or a capped fixed cut. */
function discountCents(promo: PromoCodePublic, subtotalCents: number): number {
  const discount =
    promo.type === 'percent'
      ? Math.round((subtotalCents * Number(promo.value)) / 100)
      : toCents(promo.value);
  return Math.min(discount, subtotalCents);
}

type Step = 1 | 2 | 3;

/** Checkout screen (prototype/screens/checkout.html): review → pay with balance → done. */
export function CheckoutPage() {
  const { t } = useTranslation();
  const cart = useCart();

  const [step, setStep] = useState<Step>(1);
  const [promo, setPromo] = useState<PromoCodePublic | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [flash, setFlash] = useState(false);

  const items = cart.data?.items ?? [];
  const subtotalCents = toCents(cart.data?.subtotal ?? '0.00');
  const discount = promo ? discountCents(promo, subtotalCents) : 0;
  const totalCents = subtotalCents - discount;

  const onPaid = (paidOrder: Order): void => {
    setOrder(paidOrder);
    setStep(3);
    setFlash(true);
    setTimeout(() => setFlash(false), 800);
  };

  if (cart.isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 md:px-6">
        <div className="grid items-start gap-7 lg:grid-cols-[1fr_380px]">
          <div className="h-[320px] animate-pulse rounded-lg bg-surface" />
          <div className="h-[260px] animate-pulse rounded-lg bg-surface" />
        </div>
      </div>
    );
  }

  if (cart.isError) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 text-center md:px-6">
        <Banner tone="error">{t('cart.error')}</Banner>
        <Button variant="secondary" onClick={() => void cart.refetch()}>
          {t('cart.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-6">
      {flash && <div className="flash-success" aria-hidden />}

      <div className="pb-5">
        <h1 className="mb-1.5 text-3xl font-extrabold md:text-4xl">{t('cart.title')}</h1>
        <p className="text-[15px] text-text-lo">{t('cart.subtitle')}</p>
      </div>

      <Stepper step={step} />

      {step === 3 && order ? (
        <div className="mx-auto max-w-[440px]">
          <DoneCard order={order} />
        </div>
      ) : items.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="grid items-start gap-7 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            <CartCard items={items} locked={step > 1} onChanged={() => setStep(1)} />
            <PromoCard
              promo={promo}
              onApply={(applied) => {
                setPromo(applied);
                setStep(1);
              }}
              onRemove={() => {
                setPromo(null);
                setStep(1);
              }}
            />
          </div>

          <aside className="flex flex-col gap-5 lg:sticky lg:top-24">
            <SummaryCard
              cart={cart.data!}
              promo={promo}
              discount={discount}
              totalCents={totalCents}
              canProceed={step === 1 && items.every((item) => item.isActive)}
              onProceed={() => setStep(2)}
            />
            {step === 2 && (
              <PaymentCard
                totalCents={totalCents}
                promo={promo}
                onPaid={onPaid}
                onBack={() => setStep(1)}
              />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const { t } = useTranslation();
  const steps: { id: Step; label: string }[] = [
    { id: 1, label: t('cart.steps.review') },
    { id: 2, label: t('cart.steps.payment') },
    { id: 3, label: t('cart.steps.done') },
  ];

  return (
    <div
      className="relative mb-8 flex max-w-[520px] justify-between"
      role="list"
      aria-label={t('cart.steps.label')}
    >
      <div
        className="absolute left-[34px] right-[34px] top-[17px] h-[3px] rounded-[3px] bg-border-2"
        aria-hidden
      />
      <div
        className="bg-aurora absolute left-[34px] top-[17px] h-[3px] rounded-[3px] shadow-[0_0_14px_rgba(91,91,246,0.7)] transition-[width] duration-500"
        style={{ width: `calc((100% - 68px) * ${(step - 1) / (steps.length - 1)})` }}
        aria-hidden
      />
      {steps.map(({ id, label }) => {
        const state = id < step ? 'done' : id === step ? 'active' : 'idle';
        return (
          <div
            key={id}
            role="listitem"
            aria-current={state === 'active' ? 'step' : undefined}
            className="relative z-[1] flex flex-1 flex-col items-center gap-2"
          >
            <span
              className={`grid h-9 w-9 place-items-center rounded-pill font-display text-sm font-bold transition-all duration-300 ${
                state === 'active'
                  ? 'bg-aurora border-transparent text-white shadow-glow-volt'
                  : state === 'done'
                    ? 'border border-success bg-[rgba(43,217,166,0.16)] text-success'
                    : 'border border-border-2 bg-surface-2 text-text-lo'
              }`}
            >
              {state === 'done' ? <Icon name="check" className="!h-4 !w-4" /> : id}
            </span>
            <span
              className={`text-[13px] font-semibold ${
                state === 'active'
                  ? 'text-text-hi'
                  : state === 'done'
                    ? 'text-text'
                    : 'text-text-dim'
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyCart() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-[520px] rounded-lg border border-border bg-surface px-5 py-14 text-center">
      <Icon name="cart" className="mb-4 !h-[52px] !w-[52px] text-text-dim" />
      <h3 className="mb-2 text-xl font-bold">{t('cart.empty.title')}</h3>
      <p className="mx-auto mb-6 max-w-[340px] text-text-lo">{t('cart.empty.text')}</p>
      <Link
        to="/catalog"
        className="bg-aurora inline-flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white shadow-glow-volt transition-transform duration-[140ms] hover:-translate-y-px"
      >
        {t('cart.empty.browse')} <Icon name="arrow-right" className="!h-4 !w-4" />
      </Link>
    </div>
  );
}

function CartCard({
  items,
  locked,
  onChanged,
}: {
  items: CartItem[];
  locked: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="rounded-lg border border-border bg-surface px-6 py-2 shadow-2">
      <div className="flex items-center justify-between py-4">
        <h3 className="text-[17px] font-bold">{t('cart.yourCart')}</h3>
        <span className="text-sm text-text-lo">{t('cart.items', { count: items.length })}</span>
      </div>
      <div>
        {items.map((item) => (
          <CartRow key={item.id} item={item} locked={locked} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

function CartRow({
  item,
  locked,
  onChanged,
}: {
  item: CartItem;
  locked: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const busy = update.isPending || remove.isPending;

  const maxQuantity =
    item.fulfillmentType === 'READY_STOCK' ? Math.min(item.stockCount, MAX_QUANTITY) : MAX_QUANTITY;

  const setQuantity = (quantity: number): void => {
    onChanged();
    update.mutate({ id: item.id, quantity });
  };

  return (
    <div className="grid grid-cols-[60px_1fr_auto] items-center gap-4 border-b border-border py-4 last:border-b-0">
      <Link
        to={`/product/${item.productSlug}`}
        className="grid h-[60px] w-[60px] place-items-center rounded-md border border-border bg-gradient-to-br from-surface-2 to-surface-3"
      >
        <Icon
          name={catalogIcon(item.attributes, item.productSlug) as IconName}
          className="!h-[30px] !w-[30px]"
        />
      </Link>
      <div className="min-w-0">
        <h4 className="mb-1 truncate text-[15px] font-bold text-text-hi">
          <Link to={`/product/${item.productSlug}`} className="hover:text-volt-400">
            {item.name}
          </Link>
        </h4>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-lo">
          {!item.isActive ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-[rgba(255,77,109,0.14)] px-2.5 text-xs font-semibold text-danger">
              {t('cart.unavailable')}
            </span>
          ) : item.fulfillmentType === 'READY_STOCK' ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-[rgba(43,217,166,0.14)] px-2.5 text-xs font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-pill bg-success" aria-hidden />
              {t('cart.inStock', { count: item.stockCount })}
            </span>
          ) : (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-[rgba(245,183,64,0.14)] px-2.5 text-xs font-semibold text-warning">
              {t('cart.madeToOrder')}
            </span>
          )}
          <span className="uppercase tracking-[0.04em] text-text-dim">{item.sku}</span>
        </div>
        <div className="mt-1.5 text-xs tabular-nums text-text-dim">
          {t('cart.each', { price: formatMoney(item.unitPrice, 'USD') })}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2.5">
        <button
          type="button"
          onClick={() => {
            onChanged();
            remove.mutate({ id: item.id });
          }}
          disabled={busy}
          aria-label={t('cart.remove', { name: item.name })}
          className="rounded-sm p-1 text-text-dim transition-colors duration-[140ms] hover:bg-[rgba(255,77,109,0.12)] hover:text-danger disabled:opacity-40"
        >
          <Icon name="trash" className="!h-[15px] !w-[15px]" />
        </button>
        <div className="inline-flex items-center overflow-hidden rounded-pill border border-border-2 bg-surface-2">
          <button
            type="button"
            onClick={() => setQuantity(item.quantity - 1)}
            disabled={busy || locked || item.quantity <= 1}
            aria-label={t('cart.decrease')}
            className="grid h-[30px] w-[30px] place-items-center text-text transition-colors duration-[140ms] hover:bg-surface-3 hover:text-text-hi disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Icon name="minus" className="!h-3.5 !w-3.5" />
          </button>
          <span
            className="min-w-[30px] text-center text-sm font-bold tabular-nums text-text-hi"
            aria-label={t('cart.quantity')}
          >
            {item.quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity(item.quantity + 1)}
            disabled={busy || locked || !item.isActive || item.quantity >= maxQuantity}
            aria-label={t('cart.increase')}
            className="grid h-[30px] w-[30px] place-items-center text-text transition-colors duration-[140ms] hover:bg-surface-3 hover:text-text-hi disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Icon name="plus" className="!h-3.5 !w-3.5" />
          </button>
        </div>
        <div className="font-display text-[17px] font-bold tabular-nums text-text-hi">
          {formatMoney(item.lineTotal, 'USD')}
        </div>
      </div>
    </div>
  );
}

function PromoCard({
  promo,
  onApply,
  onRemove,
}: {
  promo: PromoCodePublic | null;
  onApply: (promo: PromoCodePublic) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const apply = useApplyPromo();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const value = code.trim();
    if (!value) {
      setError(t('cart.promo.enterFirst'));
      return;
    }
    setError(null);
    apply.mutate(value, {
      onSuccess: (applied) => {
        setCode('');
        onApply(applied);
      },
      onError: (err) => {
        setError(
          err instanceof ApiRequestError && err.code === 'PROMO_INVALID'
            ? t('errors.PROMO_INVALID')
            : t(errorKey(err)),
        );
      },
    });
  };

  return (
    <section className="mt-5 rounded-lg border border-border bg-surface p-6 shadow-2">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-text-hi">
        <Icon name="tag" className="!h-4 !w-4 text-pulse" /> {t('cart.promo.title')}
      </h4>
      {promo ? (
        <div className="flex items-center justify-between rounded-md border border-[rgba(43,217,166,0.3)] bg-[rgba(43,217,166,0.1)] px-3 py-2.5">
          <span className="inline-flex items-center gap-2 font-mono text-[13px] font-bold text-success">
            <Icon name="check" className="!h-3.5 !w-3.5" /> {promo.code} ·{' '}
            {promo.type === 'percent'
              ? `−${Number(promo.value)}%`
              : `−${formatMoney(promo.value, 'USD')}`}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-sm px-2 py-1 text-xs text-text-lo transition-colors duration-[140ms] hover:bg-[rgba(255,77,109,0.1)] hover:text-danger"
          >
            {t('cart.promo.remove')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2.5">
            <input
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={t('cart.promo.placeholder')}
              aria-label={t('cart.promo.label')}
              aria-invalid={error ? true : undefined}
              autoComplete="off"
              spellCheck={false}
              className={`h-11 flex-1 rounded-md border bg-surface-2 px-3.5 text-sm uppercase tracking-[0.04em] text-text-hi transition-[border-color,box-shadow] duration-[140ms] placeholder:normal-case placeholder:tracking-normal placeholder:text-text-dim focus:border-volt focus:shadow-glow-volt focus:outline-none ${
                error ? 'border-danger' : 'border-border'
              }`}
            />
            <Button
              variant="secondary"
              className="!h-11"
              loading={apply.isPending}
              onClick={submit}
            >
              {t('cart.promo.apply')}
            </Button>
          </div>
          <p
            className={`mt-2.5 min-h-4 text-[12.5px] ${error ? 'text-danger' : 'text-text-dim'}`}
            role="status"
            aria-live="polite"
          >
            {error ?? ''}
          </p>
        </>
      )}
    </section>
  );
}

function SummaryCard({
  cart,
  promo,
  discount,
  totalCents,
  canProceed,
  onProceed,
}: {
  cart: Cart;
  promo: PromoCodePublic | null;
  discount: number;
  totalCents: number;
  canProceed: boolean;
  onProceed: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-2">
      <h3 className="mb-4 text-[17px] font-bold">{t('cart.summary.title')}</h3>
      <div className="flex items-center justify-between py-2 text-sm text-text-lo">
        <span>{t('cart.summary.subtotal')}</span>
        <span className="font-semibold tabular-nums text-text">
          {formatMoney(cart.subtotal, cart.currency)}
        </span>
      </div>
      {promo && (
        <div className="flex items-center justify-between py-2 text-sm text-text-lo">
          <span>
            {t('cart.summary.discount')}{' '}
            <span className="ml-1 inline-flex h-6 items-center rounded-pill bg-[rgba(43,217,166,0.16)] px-2.5 text-xs font-semibold text-success">
              {promo.code}
            </span>
          </span>
          <span className="font-semibold tabular-nums text-success">
            −{formatMoney(fromCents(discount), cart.currency)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between py-2 text-sm text-text-lo">
        <span>{t('cart.summary.delivery')}</span>
        <span className="font-semibold text-success">{t('cart.summary.deliveryFree')}</span>
      </div>
      <div className="my-3 h-px bg-border" />
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-semibold text-text-hi">{t('cart.summary.total')}</span>
        <span className="font-display text-[28px] font-extrabold tabular-nums tracking-tight text-text-hi">
          {formatMoney(fromCents(totalCents), cart.currency)}
        </span>
      </div>
      <Button block className="mt-4" disabled={!canProceed} onClick={onProceed}>
        {t('cart.summary.proceed')} <Icon name="arrow-right" className="!h-4 !w-4" />
      </Button>
    </section>
  );
}

function PaymentCard({
  totalCents,
  promo,
  onPaid,
  onBack,
}: {
  totalCents: number;
  promo: PromoCodePublic | null;
  onPaid: (order: Order) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const checkout = useCheckout();
  // One idempotency key per logical checkout: retrying an error reuses it;
  // going back to edit the cart starts a fresh operation.
  const keyRef = useRef<string | null>(null);
  useEffect(() => () => void (keyRef.current = null), []);

  const balanceCents = toCents(user?.balance ?? '0.00');
  const shortfall = totalCents - balanceCents;
  const total = fromCents(totalCents);

  const pay = (): void => {
    keyRef.current ??= crypto.randomUUID();
    checkout.mutate(
      {
        body: promo ? { promoCode: promo.code } : {},
        idempotencyKey: keyRef.current,
      },
      {
        onSuccess: (order) => {
          keyRef.current = null;
          // The balance changed — refresh the profile behind the header/account.
          apiFetch<User>('/me')
            .then(setUser)
            .catch(() => undefined);
          onPaid(order);
        },
      },
    );
  };

  const insufficientFromServer =
    checkout.error instanceof ApiRequestError && checkout.error.code === 'INSUFFICIENT_BALANCE';
  const insufficient = shortfall > 0 || insufficientFromServer;

  return (
    <section className="fade-up rounded-lg border border-border bg-surface p-6 shadow-2">
      <h3 className="mb-4 text-[17px] font-bold">{t('cart.payment.title')}</h3>

      <div className="mb-4 rounded-md border border-border bg-surface-2 px-4 py-3.5">
        <div className="flex items-center justify-between py-1 text-[13.5px] text-text-lo">
          <span>{t('cart.payment.balance')}</span>
          <span className="font-bold tabular-nums text-text-hi">
            {formatMoney(user?.balance ?? '0.00', 'USD')}
          </span>
        </div>
        <div className="flex items-center justify-between py-1 text-[13.5px] text-text-lo">
          <span>{t('cart.payment.orderTotal')}</span>
          <span className="font-bold tabular-nums text-text-hi">{formatMoney(total, 'USD')}</span>
        </div>
      </div>

      <div
        className={`mb-4 flex items-center gap-2 rounded-md px-3 py-2.5 text-[13px] font-semibold ${
          insufficient
            ? 'bg-[rgba(245,183,64,0.12)] text-warning'
            : 'bg-[rgba(43,217,166,0.12)] text-success'
        }`}
        role="status"
      >
        <Icon name={insufficient ? 'info' : 'check'} className="!h-4 !w-4 shrink-0" />
        {insufficient
          ? t('cart.payment.insufficient', {
              amount: formatMoney(fromCents(Math.max(shortfall, 0)), 'USD'),
            })
          : t('cart.payment.sufficient')}
      </div>

      {checkout.isError && !insufficientFromServer && (
        <Banner tone="error">{t(errorKey(checkout.error))}</Banner>
      )}

      {insufficient ? (
        <Button block variant="secondary" onClick={() => navigate('/wallet')}>
          <Icon name="plus" className="!h-4 !w-4" /> {t('cart.payment.topUp')}
        </Button>
      ) : (
        <Button block loading={checkout.isPending} onClick={pay}>
          <Icon name="bolt" className="!h-4 !w-4" />{' '}
          {t('cart.payment.pay', { amount: formatMoney(total, 'USD') })}
        </Button>
      )}
      <p className="mt-3 text-center text-xs text-text-dim">{t('cart.payment.hint')}</p>
      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-2 block text-[12.5px] font-semibold text-text-dim underline-offset-2 hover:text-text-hi hover:underline"
      >
        {t('cart.payment.back')}
      </button>
    </section>
  );
}

function DoneCard({ order }: { order: Order }) {
  const { t } = useTranslation();

  return (
    <section className="fade-up relative overflow-hidden rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-2">
      <div className="aurora-mini" aria-hidden />
      <div className="relative z-[1]">
        <span className="mx-auto mb-4 grid h-[68px] w-[68px] place-items-center rounded-pill bg-[rgba(43,217,166,0.16)] text-success shadow-glow-success">
          <Icon name="check" className="!h-[34px] !w-[34px]" />
        </span>
        <h3 className="mb-2 text-[22px] font-bold">{t('cart.done.title')}</h3>
        <p className="mb-5 text-sm text-text-lo">{t('cart.done.text')}</p>
        <div className="flex items-center justify-between border-t border-border py-2.5 text-[13.5px] text-text-lo">
          <span>{t('cart.done.order')}</span>
          <span className="font-bold tabular-nums text-text-hi">{order.number}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border py-2.5 text-[13.5px] text-text-lo">
          <span>{t('cart.done.paid')}</span>
          <span className="font-bold tabular-nums text-text-hi">
            {formatMoney(order.total, order.currency)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border py-2.5 text-[13.5px] text-text-lo">
          <span>{t('cart.done.delivery')}</span>
          <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-[rgba(245,183,64,0.14)] px-2.5 text-xs font-semibold text-warning">
            {t('cart.done.processing')}
          </span>
        </div>
        <div className="mt-5 flex flex-col gap-2.5">
          <Link
            to={`/orders/${order.id}`}
            className="bg-aurora inline-flex h-12 items-center justify-center gap-2 rounded-md px-5 text-[15px] font-semibold text-white shadow-glow-volt transition-transform duration-[140ms] hover:-translate-y-px"
          >
            {t('cart.done.viewOrder')} <Icon name="arrow-right" className="!h-4 !w-4" />
          </Link>
          <Link
            to="/catalog"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border-2 bg-surface-2 px-5 text-[15px] font-semibold text-text-hi transition-colors duration-[140ms] hover:border-volt"
          >
            {t('cart.done.continue')}
          </Link>
        </div>
      </div>
    </section>
  );
}
