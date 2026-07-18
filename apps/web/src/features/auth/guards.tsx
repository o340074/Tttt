import { useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

function BootSplash() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-pill border-2 border-border-2 border-t-volt" />
    </div>
  );
}

/** Wraps private routes: waits for boot, then redirects guests to login. */
export function RequireAuth() {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <BootSplash />;
  if (!user) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/**
 * Wraps auth screens: users who arrive already signed in go to their account.
 * Only the state at arrival counts — when the user appears mid-flight
 * (login/register just succeeded), the page's own navigate() decides where
 * to go (e.g. register → /auth/verify), and this guard must not race it.
 */
export function RedirectIfAuthed() {
  const { user, booting } = useAuth();
  const authedAtArrival = useRef<boolean | null>(null);
  if (booting) return <BootSplash />;
  authedAtArrival.current ??= Boolean(user);
  if (authedAtArrival.current && user) return <Navigate to="/account" replace />;
  return <Outlet />;
}
