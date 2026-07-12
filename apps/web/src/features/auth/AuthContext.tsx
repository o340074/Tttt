import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch, refreshSession, setAccessToken } from '../../lib/api';
import { AuthContext } from './context';
import type { AuthContextValue } from './context';
import type { LoginRequest, RegisterRequest, TokenResponse, User } from '@advault/types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const { i18n } = useTranslation();

  const applyUserLocale = useCallback(
    (nextUser: User) => {
      if (i18n.resolvedLanguage !== nextUser.locale) void i18n.changeLanguage(nextUser.locale);
    },
    [i18n],
  );

  const loadMe = useCallback(async (): Promise<User> => {
    const me = await apiFetch<User>('/me');
    setUserState(me);
    applyUserLocale(me);
    return me;
  }, [applyUserLocale]);

  // Boot: the refresh cookie (if any) restores the session after a reload.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (await refreshSession()) await loadMe();
      } catch {
        setAccessToken(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const login = useCallback(
    async (payload: LoginRequest): Promise<User> => {
      const tokens = await apiFetch<TokenResponse>('/auth/login', {
        method: 'POST',
        body: payload,
        anonymous: true,
      });
      setAccessToken(tokens.accessToken);
      return loadMe();
    },
    [loadMe],
  );

  const register = useCallback(
    async (payload: RegisterRequest): Promise<User> => {
      const tokens = await apiFetch<TokenResponse>('/auth/register', {
        method: 'POST',
        body: payload,
        anonymous: true,
      });
      setAccessToken(tokens.accessToken);
      return loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST', anonymous: true });
    } finally {
      setAccessToken(null);
      setUserState(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, booting, login, register, logout, setUser: setUserState }),
    [user, booting, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
