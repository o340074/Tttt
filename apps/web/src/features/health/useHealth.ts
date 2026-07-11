import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@advault/types';

/**
 * GET /api/v1/health — contract: docs/backend/openapi.md.
 * 503 still carries a HealthResponse body (degraded), so it is not an error.
 */
async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', { headers: { Accept: 'application/json' } });
  if (!response.ok && response.status !== 503) {
    throw new Error(`Health check failed: HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    retry: 1,
  });
}
