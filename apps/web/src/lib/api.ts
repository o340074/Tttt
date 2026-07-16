import type { ApiError, ApiErrorCode, TokenResponse } from '@advault/types';

/**
 * API client (docs/backend/openapi.md). The access token lives in memory only;
 * the refresh token is an HTTP-only cookie managed by the API. On a 401 the
 * client refreshes once and retries the request.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function toApiError(response: Response): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as ApiError;
    return new ApiRequestError(
      body.error.code,
      body.error.message,
      response.status,
      body.error.details,
    );
  } catch {
    return new ApiRequestError('INTERNAL_ERROR', `HTTP ${response.status}`, response.status);
  }
}

/** Single-flight refresh: concurrent 401s share one /auth/refresh call. */
let refreshInFlight: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        // Never let a stalled API wedge the boot splash: bail after 8s so the
        // app falls back to the signed-out state instead of a blank screen.
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        setAccessToken(null);
        return false;
      }
      const body = (await response.json()) as TokenResponse;
      setAccessToken(body.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Skip bearer + auto-refresh (public endpoints). */
  anonymous?: boolean;
  /** Extra request headers (e.g. Idempotency-Key). */
  headers?: Record<string, string>;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, headers } = options;

  const doFetch = (): Promise<Response> =>
    fetch(`/api/v1${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(!anonymous && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let response = await doFetch();
  if (response.status === 401 && !anonymous && (await refreshSession())) {
    response = await doFetch();
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
