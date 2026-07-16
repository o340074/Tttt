import { Injectable, Logger } from '@nestjs/common';
import { WebSocketServer, type WebSocket } from 'ws';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import type { NotificationSocketMessage } from '@advault/types';

/** WebSocket path (behind the `/api` proxy so it shares the HTTP entrypoint). */
export const NOTIFICATIONS_WS_PATH = '/api/ws/notifications';

/**
 * Realtime notifications transport (E9 debt — replaces badge polling). A single
 * `ws` server is attached to the same HTTP server the REST API runs on, so it
 * lives inside the one Nest process (no separate service to deploy/scale). The
 * badge subscribes; on any delivery — and on read/read-all — the owner's live
 * sockets are pushed the fresh unread count, and the client degrades to polling
 * whenever the socket is unavailable.
 *
 * Connections authenticate with the access token as a `?token=` query parameter
 * (browsers cannot set headers on a WebSocket handshake); an invalid/absent
 * token is rejected at the HTTP upgrade with 401. Sockets are tracked per user
 * so a push only ever reaches that user's own tabs.
 *
 * Single-instance scope: pushes reach clients connected to *this* process. A
 * horizontally-scaled deployment would fan out via Redis pub/sub — until then
 * the client's polling fallback covers cross-instance gaps (docs/17 §7).
 */
@Injectable()
export class NotificationsRealtimeService {
  private readonly logger = new Logger('NotificationsRealtime');
  private wss: WebSocketServer | null = null;
  /** userId → its live sockets (a user may have several tabs open). */
  private readonly clients = new Map<string, Set<WebSocket>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Attach the ws server to the running HTTP server (called once from bootstrap).
   * Idempotent — a second call is a no-op. Never called from the test harness,
   * so unit/e2e suites carry the service as an inert no-op.
   */
  attach(server: HttpServer): void {
    if (this.wss) return;
    const wss = new WebSocketServer({ noServer: true });
    this.wss = wss;

    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? '', 'http://localhost');
      if (url.pathname !== NOTIFICATIONS_WS_PATH) return; // not ours — leave it alone

      const token = url.searchParams.get('token');
      const userId = token ? (this.tokens.verifyAccess(token)?.sub ?? null) : null;
      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => this.register(userId, ws));
    });

    this.logger.log(`Realtime notifications listening on ${NOTIFICATIONS_WS_PATH}`);
  }

  /** Push the fresh unread count to every live socket of one user (best-effort). */
  broadcastUnread(userId: string, unread: number): void {
    this.send(userId, { type: 'unread', unread });
  }

  /** Number of live sockets for a user — used by tests/metrics. */
  clientCount(userId: string): number {
    return this.clients.get(userId)?.size ?? 0;
  }

  async onModuleDestroy(): Promise<void> {
    for (const set of this.clients.values()) for (const ws of set) ws.close();
    this.clients.clear();
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()));
  }

  // ---------- Internals ----------

  private register(userId: string, ws: WebSocket): void {
    let set = this.clients.get(userId);
    if (!set) {
      set = new Set();
      this.clients.set(userId, set);
    }
    set.add(ws);
    ws.on('close', () => this.unregister(userId, ws));
    ws.on('error', () => this.unregister(userId, ws));
    // Seed the badge with the current count so a fresh socket is authoritative.
    void this.sendInitial(userId, ws);
  }

  private unregister(userId: string, ws: WebSocket): void {
    const set = this.clients.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) this.clients.delete(userId);
  }

  private async sendInitial(userId: string, ws: WebSocket): Promise<void> {
    try {
      const unread = await this.prisma.notification.count({ where: { userId, readAt: null } });
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'unread', unread } satisfies NotificationSocketMessage));
      }
    } catch (error) {
      this.logger.warn(`initial unread push failed for ${userId}: ${String(error)}`);
    }
  }

  private send(userId: string, message: NotificationSocketMessage): void {
    const set = this.clients.get(userId);
    if (!set || set.size === 0) return;
    const payload = JSON.stringify(message);
    for (const ws of set) {
      if (ws.readyState !== ws.OPEN) continue;
      try {
        ws.send(payload);
      } catch {
        // A dead socket surfaces via its own 'close'/'error'; drop this push.
      }
    }
  }
}
