import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';
import type { RequestHandler } from 'express';

/**
 * Security headers (docs/09 — «Заголовки безопасности (CSP, HSTS, X-Frame-Options)»).
 *
 * The API only ever returns JSON, so its own documents never load scripts,
 * styles or frames — we can lock the Content-Security-Policy down to `'none'`
 * as defence-in-depth (a strict CSP on an API response protects the odd error
 * page or any content sniffed as HTML). HSTS/frameguard/noSniff/referrer are the
 * standard hardening set. Swagger UI (dev only, see main.ts) needs inline
 * scripts/styles, so its route gets a relaxed policy layered on top.
 */
export function configureSecurity(app: INestApplication, isProduction: boolean): void {
  const strictCsp = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    // Enable HSTS only in production; on http://localhost it would pin the
    // browser to https and break local dev.
    hsts: isProduction ? { maxAge: 15_552_000, includeSubDomains: true, preload: false } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    // X-Content-Type-Options: nosniff and X-DNS-Prefetch-Control are on by default.
    // COEP is intentionally left off — it breaks cross-origin JSON fetches.
    crossOriginEmbedderPolicy: false,
  });

  app.use(strictCsp);
}

/**
 * A Swagger-friendly CSP (allows the inline scripts/styles the UI needs).
 * Layered onto the `/api/docs` route only; the strict policy still covers
 * everything else. Dev/staging only — Swagger is not mounted in production.
 */
export function swaggerCspRelaxation(): RequestHandler {
  return helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      frameAncestors: ["'none'"],
    },
  }) as unknown as RequestHandler;
}
