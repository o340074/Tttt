import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NOTIFICATIONS_WS_PATH, NotificationsRealtimeService } from './notifications.realtime';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokenService } from '../auth/token.service';
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
