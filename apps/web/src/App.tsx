import { Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/layout/AdminLayout';
import { AppLayout } from './components/layout/AppLayout';
import { AuthLayout } from './features/auth/AuthLayout';
import { RequireStaff } from './features/admin/RequireStaff';
import { RedirectIfAuthed, RequireAuth } from './features/auth/guards';
import { AdminCatalogPage } from './pages/admin/AdminCatalogPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminFinancePage } from './pages/admin/AdminFinancePage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminStaffPage } from './pages/admin/AdminStaffPage';
import { AdminTicketDetailPage } from './pages/admin/AdminTicketDetailPage';
import { AdminTicketsPage } from './pages/admin/AdminTicketsPage';
import { AdminOrderDetailPage } from './pages/admin/AdminOrderDetailPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminPlanDetailPage } from './pages/admin/AdminPlanDetailPage';
import { AdminPlansPage } from './pages/admin/AdminPlansPage';
import { AdminProductDetailPage } from './pages/admin/AdminProductDetailPage';
import { AdminPromoPage } from './pages/admin/AdminPromoPage';
import { AdminStockPage } from './pages/admin/AdminStockPage';
import { AdminUserDetailPage } from './pages/admin/AdminUserDetailPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { InventoryPage } from './pages/admin/InventoryPage';
import { WarmingBoardPage } from './pages/admin/WarmingBoardPage';
import { WarmingJobPage } from './pages/admin/WarmingJobPage';
import { AccountPage } from './pages/AccountPage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OrderPage } from './pages/OrderPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProductPage } from './pages/ProductPage';
import { SupportPage } from './pages/SupportPage';
import { TicketPage } from './pages/TicketPage';
import { WalletPage } from './pages/WalletPage';
import { AuthPage } from './pages/auth/AuthPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="product/:slug" element={<ProductPage />} />
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="support/:id" element={<TicketPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Admin / operator area (docs/13) — staff-only, own layout. */}
      <Route element={<RequireStaff />}>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminOrdersPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="orders/:id" element={<AdminOrderDetailPage />} />
          <Route path="warming" element={<WarmingBoardPage />} />
          <Route path="warming/:id" element={<WarmingJobPage />} />
          <Route path="catalog" element={<AdminCatalogPage />} />
          <Route path="catalog/:id" element={<AdminProductDetailPage />} />
          <Route path="plans" element={<AdminPlansPage />} />
          <Route path="plans/:id" element={<AdminPlanDetailPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="stock" element={<AdminStockPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:id" element={<AdminUserDetailPage />} />
          <Route path="finance" element={<AdminFinancePage />} />
          <Route path="promo" element={<AdminPromoPage />} />
          <Route path="tickets" element={<AdminTicketsPage />} />
          <Route path="tickets/:id" element={<AdminTicketDetailPage />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="staff" element={<AdminStaffPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>

      <Route path="auth" element={<AuthLayout />}>
        <Route element={<RedirectIfAuthed />}>
          <Route index element={<AuthPage view="login" />} />
          <Route path="login" element={<AuthPage view="login" />} />
          <Route path="register" element={<AuthPage view="register" />} />
          <Route path="forgot" element={<ForgotPasswordPage />} />
          <Route path="reset" element={<ResetPasswordPage />} />
        </Route>
        {/* Reachable signed-in or signed-out: email links and the post-register screen. */}
        <Route path="verify" element={<VerifyEmailPage />} />
      </Route>
    </Routes>
  );
}
