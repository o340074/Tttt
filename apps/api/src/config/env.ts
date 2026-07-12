import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Base URL of the web app — used to build links in (stub) emails. */
  WEB_URL: z.string().url().default('http://localhost:5173'),
  // Dev defaults keep local/test boot simple; production MUST override both secrets.
  JWT_ACCESS_SECRET: z.string().min(16).default('advault-dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(16).default('advault-dev-refresh-secret-change-me'),
  /** Access-token TTL, seconds (docs/09: short-lived, 15 min). */
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  /** Refresh-token TTL, seconds (30 days). */
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  if (
    parsed.data.NODE_ENV === 'production' &&
    (parsed.data.JWT_ACCESS_SECRET.includes('change-me') ||
      parsed.data.JWT_REFRESH_SECRET.includes('change-me'))
  ) {
    throw new Error('JWT secrets must be overridden in production');
  }
  return parsed.data;
}
