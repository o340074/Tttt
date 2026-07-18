import { createContext } from 'react';
import type { LoginRequest, RegisterRequest, User } from '@advault/types';

export interface AuthContextValue {
  /** null while signed out. */
  user: User | null;
  /** True until the boot refresh attempt settles. */
  booting: boolean;
  login: (payload: LoginRequest) => Promise<User>;
  register: (payload: RegisterRequest) => Promise<User>;
  logout: () => Promise<void>;
  /** Replace the cached profile (e.g. after PATCH /me). */
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
