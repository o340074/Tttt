import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useContentLocale } from '../catalog/api';
import { useAuth } from '../auth/useAuth';
import { isStaffRole } from '@advault/types';
import type {
  AdminCategory,
  AdminOrderDetail,
  AdminOrderListItem,
  AdminProductDetail,
  AdminProductListItem,
  AdminProductQuery,
  AdminPromoCode,
  AdminStockRow,
  AdminVariant,
  AdminWarmingPlanDetail,
  AdminWarmingPlanListItem,
  CreateCategoryRequest,
  CreateProductRequest,
  CreateVariantRequest,
  CreateWarmingPlanRequest,
  UpdateCategoryRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
  UpdateWarmingPlanRequest,
  AdminUserDetail,
  AdminUserListItem,
  AdminTicketDetail,
  AdminTicketListItem,
  AdminStaffMember,
  CreateTicketRequest,
  CreateTicketMessageRequest,
  UpdateTicketRequest,
  TicketStatus,
  DashboardSummary,
  SalesReport,
  FulfillmentReport,
  OperatorLoadReport,
  ShopSettings,
  UpdateSettingsRequest,
  BindOctoProfileRequest,
  BindProxyRequest,
  CreateOctoProfileRequest,
  CreatePromoCodeRequest,
  CreateProxyRequest,
  FinanceSummary,
  JobInventory,
  ManualDeliverRequest,
  OctoProfileView,
  OctoProfileStatus,
  OrderStatus,
  Paginated,
  ProxyImportReport,
  ProxyItemView,
  ProxyStatus,
  RefundRequest,
  RefundResult,
  Role,
  UpdatePromoCodeRequest,
  UserStatus,
  WarmingJobAction,
  WarmingJobDetail,
  WarmingJobStatus,
  WarmingJobSummary,
  WarmingTaskStatus,
} from '@advault/types';

/** True when the signed-in user may reach the admin/operator area at all. */
export function useIsStaff(): boolean {
  const { user } = useAuth();
  return Boolean(user && isStaffRole(user.role));
}

/** True for money-touching (FINANCE_STAFF) roles — warranty fulfillment, refunds. */
export function useIsElevated(): boolean {
  const { user } = useAuth();
  return Boolean(user && (user.role === 'manager' || user.role === 'admin'));
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

// ---------- Orders ----------

export interface AdminOrderFilters {
  page: number;
  limit: number;
  status?: OrderStatus;
  q?: string;
}

export function useAdminOrders(filters: AdminOrderFilters) {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['admin', 'orders', locale, filters],
    queryFn: () =>
      apiFetch<Paginated<AdminOrderListItem>>(`/admin/orders${qs({ ...filters, locale })}`),
  });
}

export function useAdminOrder(id: string | undefined) {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['admin', 'order', id, locale],
    queryFn: () => apiFetch<AdminOrderDetail>(`/admin/orders/${id}?locale=${locale}`),
    enabled: Boolean(id),
  });
}

/** Invalidates an order's detail + the list + the finance summary after a mutation. */
function useOrderInvalidation(id: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'order', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
  };
}

/** Manual refund (money-touching, idempotent). See docs/13 §2/§11. */
export function useRefundOrder(id: string) {
  const invalidate = useOrderInvalidation(id);
  return useMutation({
    mutationFn: (body: RefundRequest) =>
      apiFetch<RefundResult>(`/admin/orders/${id}/refund`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: invalidate,
  });
}

/** Manual delivery — enter a line's payload by hand (encrypted server-side). */
export function useManualDeliver(id: string) {
  const invalidate = useOrderInvalidation(id);
  return useMutation({
    mutationFn: ({ itemId, ...body }: { itemId: string } & ManualDeliverRequest) =>
      apiFetch<AdminOrderDetail>(`/admin/orders/${id}/items/${itemId}/deliver`, {
        method: 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

// ---------- Finance ----------

export function useFinanceSummary() {
  return useQuery({
    queryKey: ['admin', 'finance', 'summary'],
    queryFn: () => apiFetch<FinanceSummary>('/admin/finance/summary'),
  });
}

// ---------- Users ----------

export interface AdminUserFilters {
  page: number;
  limit: number;
  q?: string;
  status?: UserStatus;
  role?: Role;
}

export function useAdminUsers(filters: AdminUserFilters) {
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () => apiFetch<Paginated<AdminUserListItem>>(`/admin/users${qs({ ...filters })}`),
  });
}

export function useAdminUser(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => apiFetch<AdminUserDetail>(`/admin/users/${id}`),
    enabled: Boolean(id),
  });
}

function useUserInvalidation(id: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'user', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
  };
}

export function useSetUserBlocked(id: string) {
  const invalidate = useUserInvalidation(id);
  return useMutation({
    mutationFn: ({ blocked, reason }: { blocked: boolean; reason: string }) =>
      apiFetch<AdminUserDetail>(`/admin/users/${id}/${blocked ? 'block' : 'unblock'}`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: invalidate,
  });
}

export function useSetUserRole(id: string) {
  const invalidate = useUserInvalidation(id);
  return useMutation({
    mutationFn: ({ role, reason }: { role: Role; reason?: string }) =>
      apiFetch<AdminUserDetail>(`/admin/users/${id}/role`, {
        method: 'PATCH',
        body: { role, reason },
      }),
    onSuccess: invalidate,
  });
}

// ---------- Promo codes ----------

export function usePromoCodes() {
  return useQuery({
    queryKey: ['admin', 'promo'],
    queryFn: () => apiFetch<AdminPromoCode[]>('/admin/promo-codes'),
  });
}

function usePromoInvalidation() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ['admin', 'promo'] });
}

export function useCreatePromo() {
  const invalidate = usePromoInvalidation();
  return useMutation({
    mutationFn: (body: CreatePromoCodeRequest) =>
      apiFetch<AdminPromoCode>('/admin/promo-codes', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdatePromo() {
  const invalidate = usePromoInvalidation();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdatePromoCodeRequest) =>
      apiFetch<AdminPromoCode>(`/admin/promo-codes/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

export function useDeletePromo() {
  const invalidate = usePromoInvalidation();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/promo-codes/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

// ---------- Stock ----------

export function useAdminStock() {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['admin', 'stock', locale],
    queryFn: () => apiFetch<AdminStockRow[]>(`/admin/stock?locale=${locale}`),
  });
}

// ---------- Warming ----------

export interface WarmingFilters {
  page: number;
  limit: number;
  status?: WarmingJobStatus;
  goal?: string;
  assignedTo?: string;
}

export function useWarmingJobs(filters: WarmingFilters) {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['admin', 'warming', 'jobs', locale, filters],
    queryFn: () =>
      apiFetch<Paginated<WarmingJobSummary>>(`/admin/warming/jobs${qs({ ...filters, locale })}`),
  });
}

export function useWarmingJob(id: string | undefined) {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['admin', 'warming', 'job', id, locale],
    queryFn: () => apiFetch<WarmingJobDetail>(`/admin/warming/jobs/${id}?locale=${locale}`),
    enabled: Boolean(id),
  });
}

export function useJobInventory(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'warming', 'job', id, 'inventory'],
    queryFn: () => apiFetch<JobInventory>(`/admin/warming/jobs/${id}/inventory`),
    enabled: Boolean(id),
  });
}

/** Invalidates a job's detail + inventory + the queue after a mutation. */
function useJobInvalidation(jobId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'warming', 'job', jobId] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'warming', 'jobs'] });
  };
}

export function useAssignJob(jobId: string) {
  const invalidate = useJobInvalidation(jobId);
  return useMutation({
    mutationFn: (operatorId: string) =>
      apiFetch<WarmingJobDetail>(`/admin/warming/jobs/${jobId}/assign`, {
        method: 'POST',
        body: { operatorId },
      }),
    onSuccess: invalidate,
  });
}

export function useTransitionJob(jobId: string) {
  const invalidate = useJobInvalidation(jobId);
  return useMutation({
    mutationFn: ({ action, note }: { action: WarmingJobAction; note?: string }) =>
      apiFetch<WarmingJobDetail>(`/admin/warming/jobs/${jobId}/transition`, {
        method: 'POST',
        body: { action, note },
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateTask(jobId: string) {
  const invalidate = useJobInvalidation(jobId);
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: WarmingTaskStatus }) =>
      apiFetch<WarmingJobDetail>(`/admin/warming/jobs/${jobId}/tasks/${taskId}`, {
        method: 'POST',
        body: { status },
      }),
    onSuccess: invalidate,
  });
}

export function useSetAccount(jobId: string) {
  const invalidate = useJobInvalidation(jobId);
  return useMutation({
    mutationFn: (body: { payload: string; recovery?: string }) =>
      apiFetch<WarmingJobDetail>(`/admin/warming/jobs/${jobId}/account`, {
        method: 'POST',
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useResolveJob(jobId: string) {
  const invalidate = useJobInvalidation(jobId);
  return useMutation({
    mutationFn: ({ resolution, reason }: { resolution: 'reassign' | 'refund'; reason?: string }) =>
      apiFetch<WarmingJobDetail>(`/admin/warming/jobs/${jobId}/resolve`, {
        method: 'POST',
        body: { resolution, reason },
      }),
    onSuccess: invalidate,
  });
}

// ---------- Inventory: proxies ----------

export interface ProxyFilters {
  page: number;
  limit: number;
  status?: ProxyStatus;
  unassigned?: boolean;
}

export function useProxies(filters: ProxyFilters) {
  return useQuery({
    queryKey: ['admin', 'inventory', 'proxies', filters],
    queryFn: () =>
      apiFetch<Paginated<ProxyItemView>>(
        `/admin/inventory/proxies${qs({
          page: filters.page,
          limit: filters.limit,
          status: filters.status,
          unassigned: filters.unassigned ? 'true' : undefined,
        })}`,
      ),
  });
}

function useInventoryInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'warming', 'job'] });
  };
}

export function useCreateProxy() {
  const invalidate = useInventoryInvalidation();
  return useMutation({
    mutationFn: (body: CreateProxyRequest) =>
      apiFetch<ProxyItemView>('/admin/inventory/proxies', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useImportProxies() {
  const invalidate = useInventoryInvalidation();
  return useMutation({
    mutationFn: (text: string) =>
      apiFetch<ProxyImportReport>('/admin/inventory/proxies/import', {
        method: 'POST',
        body: text,
        headers: { 'Content-Type': 'text/plain' },
      }),
    onSuccess: invalidate,
  });
}

export function useBindProxy() {
  const invalidate = useInventoryInvalidation();
  return useMutation({
    mutationFn: ({ id, jobId }: { id: string } & BindProxyRequest) =>
      apiFetch<ProxyItemView>(`/admin/inventory/proxies/${id}/bind`, {
        method: 'POST',
        body: { jobId },
      }),
    onSuccess: invalidate,
  });
}

export function useUnbindProxy() {
  const invalidate = useInventoryInvalidation();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ProxyItemView>(`/admin/inventory/proxies/${id}/unbind`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

// ---------- Inventory: Octo profiles ----------

export interface OctoFilters {
  page: number;
  limit: number;
  status?: OctoProfileStatus;
  unassigned?: boolean;
}

export function useOctoProfiles(filters: OctoFilters) {
  return useQuery({
    queryKey: ['admin', 'inventory', 'octo', filters],
    queryFn: () =>
      apiFetch<Paginated<OctoProfileView>>(
        `/admin/inventory/octo${qs({
          page: filters.page,
          limit: filters.limit,
          status: filters.status,
          unassigned: filters.unassigned ? 'true' : undefined,
        })}`,
      ),
  });
}

export function useCreateOcto() {
  const invalidate = useInventoryInvalidation();
  return useMutation({
    mutationFn: (body: CreateOctoProfileRequest) =>
      apiFetch<OctoProfileView>('/admin/inventory/octo', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useBindOcto() {
  const invalidate = useInventoryInvalidation();
  return useMutation({
    mutationFn: ({ id, jobId, proxyItemId }: { id: string } & BindOctoProfileRequest) =>
      apiFetch<OctoProfileView>(`/admin/inventory/octo/${id}/bind`, {
        method: 'POST',
        body: { jobId, proxyItemId },
      }),
    onSuccess: invalidate,
  });
}

export function useUnbindOcto() {
  const invalidate = useInventoryInvalidation();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<OctoProfileView>(`/admin/inventory/octo/${id}/unbind`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

// ---------- Catalog & bundles (manager+) ----------

export function useAdminCategories() {
  return useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => apiFetch<AdminCategory[]>('/admin/categories'),
  });
}

function useCatalogInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'product'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
  };
}

export function useCreateCategory() {
  const invalidate = useCatalogInvalidation();
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) =>
      apiFetch<AdminCategory>('/admin/categories', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useCatalogInvalidation();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateCategoryRequest) =>
      apiFetch<AdminCategory>(`/admin/categories/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

export function useAdminProducts(query: AdminProductQuery) {
  return useQuery({
    queryKey: ['admin', 'products', query],
    queryFn: () => apiFetch<AdminProductListItem[]>(`/admin/products${qs({ ...query })}`),
  });
}

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => apiFetch<AdminProductDetail>(`/admin/products/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateProduct() {
  const invalidate = useCatalogInvalidation();
  return useMutation({
    mutationFn: (body: CreateProductRequest) =>
      apiFetch<AdminProductDetail>('/admin/products', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct(id: string) {
  const invalidate = useCatalogInvalidation();
  return useMutation({
    mutationFn: (body: UpdateProductRequest) =>
      apiFetch<AdminProductDetail>(`/admin/products/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

export function useCreateVariant(productId: string) {
  const invalidate = useCatalogInvalidation();
  return useMutation({
    mutationFn: (body: CreateVariantRequest) =>
      apiFetch<AdminVariant>(`/admin/products/${productId}/variants`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateVariant() {
  const invalidate = useCatalogInvalidation();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateVariantRequest) =>
      apiFetch<AdminVariant>(`/admin/variants/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

// ---------- Warming plans (manager+) ----------

export function useWarmingPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => apiFetch<AdminWarmingPlanListItem[]>('/admin/warming-plans'),
  });
}

export function useWarmingPlan(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'plan', id],
    queryFn: () => apiFetch<AdminWarmingPlanDetail>(`/admin/warming-plans/${id}`),
    enabled: Boolean(id),
  });
}

function usePlanInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'plan'] });
    // A version bump recomputes linked variants' ETA.
    void queryClient.invalidateQueries({ queryKey: ['admin', 'product'] });
  };
}

export function useCreatePlan() {
  const invalidate = usePlanInvalidation();
  return useMutation({
    mutationFn: (body: CreateWarmingPlanRequest) =>
      apiFetch<AdminWarmingPlanDetail>('/admin/warming-plans', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdatePlan(id: string) {
  const invalidate = usePlanInvalidation();
  return useMutation({
    mutationFn: (body: UpdateWarmingPlanRequest) =>
      apiFetch<AdminWarmingPlanDetail>(`/admin/warming-plans/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

// ---------- Tickets (support+) ----------

export interface AdminTicketFilters {
  page: number;
  limit: number;
  status?: TicketStatus;
  assigneeId?: string;
  q?: string;
}

export function useAdminTickets(filters: AdminTicketFilters) {
  return useQuery({
    queryKey: ['admin', 'tickets', filters],
    queryFn: () => apiFetch<Paginated<AdminTicketListItem>>(`/admin/tickets${qs({ ...filters })}`),
  });
}

export function useAdminTicket(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'ticket', id],
    queryFn: () => apiFetch<AdminTicketDetail>(`/admin/tickets/${id}`),
    enabled: Boolean(id),
  });
}

function useTicketInvalidation(id?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
    if (id) void queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', id] });
  };
}

export function useCreateTicket() {
  const invalidate = useTicketInvalidation();
  return useMutation({
    mutationFn: (body: CreateTicketRequest) =>
      apiFetch<AdminTicketDetail>('/admin/tickets', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useAddTicketMessage(id: string) {
  const invalidate = useTicketInvalidation(id);
  return useMutation({
    mutationFn: (body: CreateTicketMessageRequest) =>
      apiFetch<AdminTicketDetail>(`/admin/tickets/${id}/messages`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}

export function useUpdateTicket(id: string) {
  const invalidate = useTicketInvalidation(id);
  return useMutation({
    mutationFn: (body: UpdateTicketRequest) =>
      apiFetch<AdminTicketDetail>(`/admin/tickets/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
}

// ---------- Staff & roles (any staff read; role change admin-only via users) ----------

export function useAdminStaff() {
  return useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: () => apiFetch<AdminStaffMember[]>('/admin/staff'),
  });
}

// ---------- Reports / analytics (manager+) ----------

export interface ReportPeriod {
  from?: string;
  to?: string;
}

export function useDashboard(period: ReportPeriod) {
  return useQuery({
    queryKey: ['admin', 'reports', 'dashboard', period],
    queryFn: () => apiFetch<DashboardSummary>(`/admin/reports/dashboard${qs({ ...period })}`),
  });
}

export function useSalesReport(period: ReportPeriod) {
  const locale = useContentLocale();
  return useQuery({
    queryKey: ['admin', 'reports', 'sales', period, locale],
    queryFn: () => apiFetch<SalesReport>(`/admin/reports/sales${qs({ ...period, locale })}`),
  });
}

export function useFulfillmentReport(period: ReportPeriod) {
  return useQuery({
    queryKey: ['admin', 'reports', 'fulfillment', period],
    queryFn: () => apiFetch<FulfillmentReport>(`/admin/reports/fulfillment${qs({ ...period })}`),
  });
}

export function useOperatorLoad(period: ReportPeriod) {
  return useQuery({
    queryKey: ['admin', 'reports', 'operators', period],
    queryFn: () => apiFetch<OperatorLoadReport>(`/admin/reports/operators${qs({ ...period })}`),
  });
}

// ---------- Settings (admin-only) ----------

export function useSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => apiFetch<ShopSettings>('/admin/settings'),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSettingsRequest) =>
      apiFetch<ShopSettings>('/admin/settings', { method: 'PUT', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });
}
