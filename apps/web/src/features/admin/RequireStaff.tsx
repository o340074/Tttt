import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isStaffRole } from '@advault/types';
import { useAuth } from '../auth/useAuth';

function BootSplash() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-pill border-2 border-border-2 border-t-volt" />
    </div>
  );
}

/**
 * Gate for the /admin area (docs/13). Guests go to login; signed-in customers
 * (role `user`) are bounced to their account — the admin surface is staff-only.
 * The server enforces RBAC on every endpoint regardless; this is UX, not the
 * security boundary.
 */
export function RequireStaff() {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <BootSplash />;
  if (!user) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  if (!isStaffRole(user.role)) return <Navigate to="/account" replace />;
  return <Outlet />;
}
