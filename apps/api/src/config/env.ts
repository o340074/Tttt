import { z } from 'zod';
import { DEV_PAYLOAD_KEY } from '../crypto/payload-crypto';

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
  /** HMAC-SHA256 secret the payment provider signs webhooks with (E3, sandbox). */
  PAYMENT_WEBHOOK_SECRET: z.string().min(16).default('advault-dev-webhook-secret-change-me'),
  /** Payment window for a pending top-up, minutes. */
  TOPUP_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  /**
   * AES-256-GCM keys for StockItem/Delivery payloads (docs/09):
   * "v1:<base64 32B>[,v0:<base64 32B>]" — the first key encrypts, every
   * listed key decrypts, so rotation is prepending a new version.
   */
  // Dev default decodes to the 32 bytes of "advault-dev-payload-key-change!!".
  PAYLOAD_ENCRYPTION_KEY: z.string().min(10).default(DEV_PAYLOAD_KEY),
  /** How long a checkout holds reserved stock units, seconds. */
  STOCK_RESERVE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Extra ETA buffer added when a warming job goes on hold, minutes (docs/14). */
  WARMING_HOLD_BUFFER_MINUTES: z.coerce.number().int().nonnegative().default(720),
  /** Fallback stage duration when a warm variant has no plan, minutes. */
  WARMING_DEFAULT_STAGE_MINUTES: z.coerce.number().int().positive().default(1_440),
  /**
   * Sentry DSN for error reporting (M5, docs/17 §3). Empty disables reporting
   * (no-op) — the app never depends on Sentry being reachable. When set, 5xx /
   * unhandled exceptions are forwarded via the Sentry envelope HTTP API.
   */
  SENTRY_DSN: z.string().default(''),
  /** Deployment tag attached to Sentry events (e.g. git SHA or version). */
  SENTRY_RELEASE: z.string().default(''),
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
      parsed.data.JWT_REFRESH_SECRET.includes('change-me') ||
      parsed.data.PAYMENT_WEBHOOK_SECRET.includes('change-me') ||
      parsed.data.PAYLOAD_ENCRYPTION_KEY.includes('YWR2YXVsdC1kZXY'))
  ) {
    throw new Error('JWT/payment/payload secrets must be overridden in production');
  }
  return parsed.data;
}
