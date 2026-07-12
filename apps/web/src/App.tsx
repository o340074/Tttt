import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { AuthLayout } from './features/auth/AuthLayout';
import { RedirectIfAuthed, RequireAuth } from './features/auth/guards';
import { AccountPage } from './pages/AccountPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthPage } from './pages/auth/AuthPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
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
