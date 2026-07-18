import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NOTIFICATIONS_FANOUT_CHANNEL,
  NOTIFICATIONS_WS_PATH,
  NotificationsRealtimeService,
} from './notifications.realtime';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokenService } from '../auth/token.service';
import type { RedisService } from '../redis/redis.service';
import type { NotificationSocketMessage } from '@advault/types';

const USER = 'user-1';

/** Minimal fakes: verify only "valid" tokens; report a fixed unread count. */
function makeDeps(unread: number) {
  const tokens = {
    verifyAccess: (token: string) => (token === 'valid' ? { sub: USER } : null),
  } as unknown as TokenService;
  const prisma = {
    notification: { count: async () => unread },
  } as unknown as PrismaService;
  return { tokens, prisma };
}

/** Resolve the first message a socket receives, parsed. */
function nextMessage(ws: WebSocket): Promise<NotificationSocketMessage> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    ws.once('error', reject);
  });
}

describe('NotificationsRealtimeService', () => {
  let server: Server;
  let service: NotificationsRealtimeService;
  let port: number;

  beforeEach(async () => {
    const { tokens, prisma } = makeDeps(3);
    service = new NotificationsRealtimeService(prisma, tokens);
    server = createServer();
    service.attach(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const url = (token: string) => `ws://127.0.0.1:${port}${NOTIFICATIONS_WS_PATH}?token=${token}`;

  it('authenticates the token and seeds the badge with the current unread count', async () => {
    const ws = new WebSocket(url('valid'));
    const first = await nextMessage(ws);
    expect(first).toEqual({ type: 'unread', unread: 3 });
    expect(service.clientCount(USER)).toBe(1);
    ws.close();
  });

  it('pushes a fresh unread count to the connected socket', async () => {
    const ws = new WebSocket(url('valid'));
    await nextMessage(ws); // consume the initial seed
    const pushed = nextMessage(ws);
    service.broadcastUnread(USER, 7);
    expect(await pushed).toEqual({ type: 'unread', unread: 7 });
    ws.close();
  });

  it('rejects a connection with an invalid token (401, no registration)', async () => {
    const ws = new WebSocket(url('bogus'));
    await new Promise<void>((resolve) => {
      ws.once('error', () => resolve()); // handshake fails
      ws.once('open', () => resolve());
    });
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
    expect(service.clientCount(USER)).toBe(0);
  });

  it('drops a socket from the registry once it closes', async () => {
    const ws = new WebSocket(url('valid'));
    await nextMessage(ws);
    expect(service.clientCount(USER)).toBe(1);
    ws.close();
    // Wait for the server-side close to propagate.
    await new Promise((r) => setTimeout(r, 50));
    expect(service.clientCount(USER)).toBe(0);
  });
});

/**
 * In-memory stand-in for a Redis pub/sub network shared by several fake clients.
 * `publish` delivers to every fake client currently subscribed to the channel,
 * which lets us model true cross-instance fan-out with more than one service.
 */
class FakeRedisBus {
  private readonly subscribers = new Set<FakeRedisClient>();

  register(client: FakeRedisClient): void {
    this.subscribers.add(client);
  }

  unregister(client: FakeRedisClient): void {
    this.subscribers.delete(client);
  }

  publish(channel: string, payload: string): number {
    let count = 0;
    for (const sub of this.subscribers) {
      if (sub.subscribedChannels.has(channel)) {
        sub.emit('message', channel, payload);
        count += 1;
      }
    }
    return count;
  }
}

/** Minimal ioredis surface the fan-out uses: duplicate/subscribe/publish/status. */
class FakeRedisClient extends EventEmitter {
  status = 'ready';
  readonly subscribedChannels = new Set<string>();
  publishFails = false;

  constructor(private readonly bus: FakeRedisBus) {
    super();
  }

  duplicate(): FakeRedisClient {
    const sub = new FakeRedisClient(this.bus);
    this.bus.register(sub);
    return sub;
  }

  async subscribe(channel: string): Promise<number> {
    this.subscribedChannels.add(channel);
    return this.subscribedChannels.size;
  }

  async publish(channel: string, payload: string): Promise<number> {
    if (this.publishFails) throw new Error('redis down');
    return this.bus.publish(channel, payload);
  }

  disconnect(): void {
    this.bus.unregister(this);
  }
}

function makeRealtime(
  unread: number,
  client?: FakeRedisClient,
): NotificationsRealtimeService {
  const tokens = {
    verifyAccess: (token: string) => (token === 'valid' ? { sub: USER } : null),
  } as unknown as TokenService;
  const prisma = {
    notification: { count: async () => unread },
  } as unknown as PrismaService;
  const redis = client ? ({ client } as unknown as RedisService) : undefined;
  const service = new NotificationsRealtimeService(prisma, tokens, redis);
  service.onModuleInit();
  return service;
}

/** Stand up an attached ws server for a service and return its ws:// URL builder. */
async function listen(service: NotificationsRealtimeService): Promise<{
  server: Server;
  url: (token: string) => string;
}> {
  const server = createServer();
  service.attach(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, url: (token) => `ws://127.0.0.1:${port}${NOTIFICATIONS_WS_PATH}?token=${token}` };
}

describe('NotificationsRealtimeService — Redis pub/sub fan-out', () => {
  let bus: FakeRedisBus;

  beforeEach(() => {
    bus = new FakeRedisBus();
  });

  it('delivers a broadcast from one instance to a socket on another instance', async () => {
    // Instance A owns the socket; instance B (a different replica) triggers the push.
    const a = makeRealtime(0, new FakeRedisClient(bus));
    const b = makeRealtime(0, new FakeRedisClient(bus));
    const { server, url } = await listen(a);
    try {
      const ws = new WebSocket(url('valid'));
      await new Promise<NotificationSocketMessage>((resolve) =>
        ws.once('message', (d) => resolve(JSON.parse(d.toString()))),
      ); // consume A's initial seed
      const pushed = new Promise<NotificationSocketMessage>((resolve) =>
        ws.once('message', (d) => resolve(JSON.parse(d.toString()))),
      );

      b.broadcastUnread(USER, 9); // happens on the OTHER replica

      expect(await pushed).toEqual({ type: 'unread', unread: 9 });
      ws.close();
    } finally {
      await a.onModuleDestroy();
      await b.onModuleDestroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('publishes to the fan-out channel instead of pushing locally twice', async () => {
    const client = new FakeRedisClient(bus);
    const service = makeRealtime(0, client);
    const { server, url } = await listen(service);
    try {
      const ws = new WebSocket(url('valid'));
      await new Promise((resolve) => ws.once('message', resolve)); // initial seed
      // Own subscription must receive the publish and deliver exactly once.
      const messages: NotificationSocketMessage[] = [];
      ws.on('message', (d) => messages.push(JSON.parse(d.toString())));

      service.broadcastUnread(USER, 4);
      await new Promise((r) => setTimeout(r, 30));

      expect(messages).toEqual([{ type: 'unread', unread: 4 }]);
      ws.close();
    } finally {
      await service.onModuleDestroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('falls back to local delivery when a publish fails', async () => {
    const client = new FakeRedisClient(bus);
    client.publishFails = true;
    const service = makeRealtime(0, client);
    const { server, url } = await listen(service);
    try {
      const ws = new WebSocket(url('valid'));
      await new Promise((resolve) => ws.once('message', resolve)); // initial seed
      const pushed = new Promise<NotificationSocketMessage>((resolve) =>
        ws.once('message', (d) => resolve(JSON.parse(d.toString()))),
      );

      service.broadcastUnread(USER, 2);

      expect(await pushed).toEqual({ type: 'unread', unread: 2 });
      ws.close();
    } finally {
      await service.onModuleDestroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('subscribes the duplicated connection to the fan-out channel', () => {
    const client = new FakeRedisClient(bus);
    makeRealtime(0, client);
    // The subscriber is the duplicate registered on the bus; it must be listening.
    const registered = [...(bus as unknown as { subscribers: Set<FakeRedisClient> }).subscribers];
    expect(registered.some((c) => c.subscribedChannels.has(NOTIFICATIONS_FANOUT_CHANNEL))).toBe(
      true,
    );
  });

  it('stays local-only when no Redis client is available', async () => {
    const service = makeRealtime(0); // no redis
    const { server, url } = await listen(service);
    try {
      const ws = new WebSocket(url('valid'));
      await new Promise((resolve) => ws.once('message', resolve)); // initial seed
      const pushed = new Promise<NotificationSocketMessage>((resolve) =>
        ws.once('message', (d) => resolve(JSON.parse(d.toString()))),
      );

      service.broadcastUnread(USER, 6);

      expect(await pushed).toEqual({ type: 'unread', unread: 6 });
      ws.close();
    } finally {
      await service.onModuleDestroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
