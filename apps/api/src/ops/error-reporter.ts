import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env';

/** Minimal context attached to a reported error — never carries secrets/PII. */
export interface ErrorContext {
  method?: string;
  /** Request path only (no query string, no body, no headers). */
  path?: string;
  statusCode?: number;
}

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

/**
 * Dependency-free Sentry error reporter (M5, docs/17 §3). Forwards unhandled /
 * 5xx exceptions to Sentry via its envelope HTTP API using the global `fetch`
 * (Node ≥18) — no SDK dependency, so it stays trivially testable and adds no
 * supply-chain surface. Reporting is best-effort and fire-and-forget: a failure
 * to reach Sentry must never affect the request, so all errors are swallowed
 * and delivery is bounded by a short timeout.
 *
 * Disabled (no-op) when SENTRY_DSN is empty — the app never depends on Sentry
 * being configured or reachable. We deliberately send only the exception
 * (type/message/stack) plus method/path/status; request bodies, headers,
 * cookies and payloads are never included (docs/09: do not log secrets).
 */
@Injectable()
export class ErrorReporter {
  private readonly logger = new Logger(ErrorReporter.name);
  private readonly dsn: ParsedDsn | null;
  private readonly environment: string;
  private readonly release: string;

  constructor(config: ConfigService<Env, true>) {
    this.dsn = ErrorReporter.parseDsn(config.get('SENTRY_DSN', { infer: true }));
    this.environment = config.get('NODE_ENV', { infer: true });
    this.release = config.get('SENTRY_RELEASE', { infer: true });
  }

  /** Whether a DSN is configured and events will actually be sent. */
  get enabled(): boolean {
    return this.dsn !== null;
  }

  /**
   * Report an exception. Fire-and-forget: callers should not await this on the
   * request path. Returns the promise only so tests can assert delivery.
   */
  async captureException(error: unknown, context: ErrorContext = {}): Promise<void> {
    if (!this.dsn) return;
    try {
      const event = this.buildEvent(error, context);
      const envelope = this.buildEnvelope(event);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      try {
        await fetch(this.dsn.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-sentry-envelope' },
          body: envelope,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (sendError) {
      // Never let a monitoring failure surface to the request.
      this.logger.warn(`Sentry delivery failed: ${(sendError as Error).message}`);
    }
  }

  private buildEvent(error: unknown, context: ErrorContext): Record<string, unknown> {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      event_id: randomUUID().replace(/-/g, ''),
      timestamp: Date.now() / 1000,
      platform: 'node',
      level: 'error',
      environment: this.environment,
      ...(this.release ? { release: this.release } : {}),
      server_name: 'advault-api',
      exception: {
        values: [
          {
            type: err.name,
            value: err.message,
            ...(err.stack ? { stacktrace: { frames: parseStack(err.stack) } } : {}),
          },
        ],
      },
      tags: {
        ...(context.method ? { method: context.method } : {}),
        ...(context.statusCode ? { status_code: String(context.statusCode) } : {}),
      },
      ...(context.path ? { transaction: context.path } : {}),
    };
  }

  private buildEnvelope(event: Record<string, unknown>): string {
    const header = JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() });
    const itemHeader = JSON.stringify({ type: 'event' });
    const payload = JSON.stringify(event);
    return `${header}\n${itemHeader}\n${payload}\n`;
  }

  /**
   * Parse a DSN like `https://<key>@<host>/<projectId>` into the envelope
   * endpoint. Returns null for an empty or malformed DSN (reporting disabled).
   */
  private static parseDsn(dsn: string): ParsedDsn | null {
    if (!dsn) return null;
    try {
      const url = new URL(dsn);
      const publicKey = url.username;
      const projectId = url.pathname.replace(/^\//, '');
      if (!publicKey || !projectId) return null;
      const endpoint = `${url.protocol}//${url.host}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`;
      return { endpoint, publicKey };
    } catch {
      return null;
    }
  }
}

/**
 * Turn a V8 stack string into Sentry frames (oldest-first, as Sentry expects).
 * Best-effort: unparseable lines are skipped. No source is read from disk.
 */
function parseStack(stack: string): Array<Record<string, unknown>> {
  const frames: Array<Record<string, unknown>> = [];
  for (const line of stack.split('\n').slice(1)) {
    const match = /at (?:(.+?) )?\(?(.+?):(\d+):(\d+)\)?$/.exec(line.trim());
    if (!match) continue;
    frames.push({
      function: match[1] ?? '<anonymous>',
      filename: match[2],
      lineno: Number(match[3]),
      colno: Number(match[4]),
    });
  }
  return frames.reverse();
}
