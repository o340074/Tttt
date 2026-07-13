import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useContentLocale } from '../catalog/api';
import { useAuth } from '../auth/useAuth';
import type {
  AddCartItemRequest,
  Cart,
  CheckoutRequest,
  DeliveryPayload,
  Order,
  Paginated,
  PromoCodePublic,
} from '@advault/types';

export function useCart() {
  const locale = useContentLocale();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['cart', locale],
    queryFn: () => apiFetch<Cart>(`/cart?locale=${locale}`),
    enabled: Boolean(user),
  });
}

/** Total quantity across cart lines — the header badge. */
export function useCartCount(): number {
  const cart = useCart();
  return cart.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
}

function useCartMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<Cart>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (cart: Cart) => {
      queryClient.setQueriesData({ queryKey: ['cart'] }, cart);
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}

export function useAddCartItem() {
  const locale = useContentLocale();
  return useCartMutation((body: AddCartItemRequest) =>
    apiFetch<Cart>(`/cart/items?locale=${locale}`, { method: 'POST', body }),
  );
}

export function useUpdateCartItem() {
  const locale = useContentLocale();
  return useCartMutation(({ id, quantity }: { id: string; quantity: number }) =>
    apiFetch<Cart>(`/cart/items/${id}?locale=${locale}`, { method: 'PATCH', body: { quantity } }),
  );
}

export function useRemoveCartItem() {
  const locale = useContentLocale();
  return useCartMutation(({ id }: { id: string }) =>
    apiFetch<Cart>(`/cart/items/${id}?locale=${locale}`, { method: 'DELETE' }),
  );
}

/** Validates a code and returns its public part for the discount preview. */
export function useApplyPromo() {
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<PromoCodePublic>(`/promo-codes/${encodeURIComponent(code.trim().toUpperCase())}`),
  });
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CheckoutRequest; idempotencyKey: string }) =>
      apiFetch<Order>('/orders/checkout', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => {
      // The cart is spent and money moved: cart, wallet and orders all changed.
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useOrders(page: number, limit = 10) {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['orders', page, limit, locale],
    queryFn: () =>
      apiFetch<Paginated<Order>>(`/orders?page=${page}&limit=${limit}&locale=${locale}`),
    placeholderData: (previous) => previous,
  });
}

export function useOrder(id: string) {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['orders', 'detail', id, locale],
    queryFn: () => apiFetch<Order>(`/orders/${id}?locale=${locale}`),
  });
}

/**
 * Fetches the decrypted delivery for a delivered order item on demand — kept
 * out of cache (staleTime 0, no retry) so a secret is only fetched when the
 * buyer explicitly reveals it, and each fetch is audited server-side.
 */
export function useDelivery(orderId: string, itemId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['delivery', orderId, itemId],
    queryFn: () => apiFetch<DeliveryPayload>(`/orders/${orderId}/items/${itemId}/delivery`),
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
