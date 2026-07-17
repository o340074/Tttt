import { Injectable, Logger, Optional } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { RedisService } from '../redis/redis.service';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import type { NotificationSocketMessage } from '@advault/types';

/** WebSocket path (behind the `/api` proxy so it shares the HTTP entrypoint). */
export const NOTIFICATIONS_WS_PATH = '/api/ws/notifications';

/**
 * Redis pub/sub channel every API instance publishes unread-count changes to and
 * subscribes for fan-out. Payload is a JSON `{ userId, unread }`.
 */
export const NOTIFICATIONS_FANOUT_CHANNEL = 'advault:notifications:unread';

/** Wire payload published on the fan-out channel. */
interface FanoutMessage {
  userId: string;
  unread: number;
}

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
 * Multi-instance fan-out (Track A): a socket only lives on the one API replica
 * that accepted its upgrade, so a delivery/read handled on a *different* replica
 * must reach it too. Every replica publishes each unread change to a Redis
 * pub/sub channel and subscribes to it; the subscribe handler delivers to that
 * replica's own local sockets. The publisher receives its own message via its
 * own subscription, so there is a single delivery path (no local double-push).
 * When Redis pub/sub is unavailable (no Redis client, or a fake one in tests)
 * the service degrades to local-only delivery — functionally identical to the
 * former single-instance behaviour, with the client's polling fallback covering
 * cross-instance gaps (docs/17 §7).
 */
@Injectable()
export class NotificationsRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NotificationsRealtime');
  private wss: WebSocketServer | null = null;
  /** userId → its live sockets (a user may have several tabs open). */
  private readonly clients = new Map<string, Set<WebSocket>>();
  /** Shared Redis connection used to PUBLISH; null when fan-out is disabled. */
  private publisher: Redis | null = null;
  /** Dedicated Redis connection in subscribe mode; null when fan-out is disabled. */
  private subscriber: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /**
   * Wire Redis pub/sub fan-out once the module is up. Enabled only when a real
   * Redis client is injected (the client exposes `duplicate()`); the in-memory
   * test fake does not, so unit/e2e suites stay on local-only delivery. A boot
   * with Redis down still enables fan-out: publishes reach healthy peers and the
   * subscriber auto-(re)subscribes on every `ready`.
   */
  onModuleInit(): void {
    const client = this.redis?.client as Redis | undefined;
    if (!client || typeof client.duplicate !== 'function') return;

    this.publisher = client;
    // A subscribing connection cannot issue other commands, so PUBLISH must use a
    // separate connection — hence the dedicated duplicate for SUBSCRIBE.
    const subscriber = client.duplicate();
    this.subscriber = subscriber;

    subscriber.on('message', (channel, raw) => {
      if (channel !== NOTIFICATIONS_FANOUT_CHANNEL) return;
      this.onFanoutMessage(raw);
    });
    // Re-subscribe on every (re)connection: `ready` fires on the initial connect
    // and again after any reconnect, so a boot-time or transient Redis outage
    // self-heals without losing the subscription.
    subscriber.on('ready', () => {
      subscriber.subscribe(NOTIFICATIONS_FANOUT_CHANNEL).catch((error) => {
        this.logger.warn(`fan-out subscribe failed: ${String(error)}`);
      });
    });
    subscriber.on('error', (error) => {
      this.logger.warn(`fan-out subscriber error: ${error.message}`);
    });
    // Cover the case where the connection was already ready before handlers were
    // attached (e.g. an eager, non-lazy client).
    if (subscriber.status === 'ready') {
      subscriber.subscribe(NOTIFICATIONS_FANOUT_CHANNEL).catch((error) => {
        this.logger.warn(`fan-out subscribe failed: ${String(error)}`);
      });
    }
    this.logger.log('Realtime fan-out via Redis pub/sub enabled');
  }

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

  /**
   * Push the fresh unread count to every live socket of one user, on every API
   * instance. Fans out via Redis when enabled (the count is computed once by the
   * caller and delivered verbatim everywhere, so all replicas agree); otherwise
   * delivers to this instance's local sockets only.
   */
  broadcastUnread(userId: string, unread: number): void {
    if (this.publisher) {
      void this.publish(userId, unread);
    } else {
      this.deliverLocal(userId, unread);
    }
  }

  /** Number of live sockets for a user on this instance — used by tests/metrics. */
  clientCount(userId: string): number {
    return this.clients.get(userId)?.size ?? 0;
  }

  async onModuleDestroy(): Promise<void> {
    for (const set of this.clients.values()) for (const ws of set) ws.close();
    this.clients.clear();
    // The publisher is the shared RedisService client (owned/closed by RedisService);
    // only the dedicated subscriber duplicate is ours to close.
    if (this.subscriber) {
      this.subscriber.disconnect();
      this.subscriber = null;
    }
    this.publisher = null;
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()));
  }

  // ---------- Internals ----------

  /** Publish an unread change to the fan-out channel; deliver locally on failure. */
  private async publish(userId: string, unread: number): Promise<void> {
    const payload = JSON.stringify({ userId, unread } satisfies FanoutMessage);
    try {
      await this.publisher!.publish(NOTIFICATIONS_FANOUT_CHANNEL, payload);
    } catch (error) {
      // Redis unreachable: at least keep this instance's own tabs in sync (other
      // instances rely on their polling fallback until Redis recovers).
      this.logger.warn(`fan-out publish failed for ${userId}: ${String(error)}`);
      this.deliverLocal(userId, unread);
    }
  }

  /** Handle a message received on the fan-out channel: push to local sockets. */
  private onFanoutMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // malformed payload — ignore
    }
    const { userId, unread } = (parsed ?? {}) as Partial<FanoutMessage>;
    if (typeof userId === 'string' && typeof unread === 'number') {
      this.deliverLocal(userId, unread);
    }
  }

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

  /** Push an unread count to this instance's local sockets for one user. */
  private deliverLocal(userId: string, unread: number): void {
    this.send(userId, { type: 'unread', unread });
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
