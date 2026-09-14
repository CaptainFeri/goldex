import { Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService, ConfigType } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { verify } from 'jsonwebtoken';
import appEnvConfig from '../config/app.env.config';
import { ProviderBrowserClient } from './provider-browser.client';

/**
 * Carries the live browser between the admin's screen and the browser service.
 *
 * Two hops rather than one on purpose. The browser service must not be
 * reachable from outside the docker network — it is a remote-controlled browser
 * sitting next to postgres — so the panel cannot connect to it directly, and
 * this is the side that knows how to check an admin's JWT. Frames come down,
 * clicks and keystrokes go up.
 */
@WebSocketGateway({
  namespace: 'admin-provider-browser',
  cors: { origin: '*', credentials: true },
})
export class ProviderBrowserGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ProviderBrowserGateway.name);

  /**
   * One upstream socket per watched session, shared by every admin watching it.
   * Opening one per viewer would mean the browser service streaming the same
   * frames several times over.
   */
  private readonly upstreams = new Map<string, ClientSocket>();
  /** How many admin sockets are in each session's room, so the last one out closes it. */
  private readonly watchers = new Map<string, Set<string>>();

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<ConfigType<typeof appEnvConfig>>,
    private readonly client: ProviderBrowserClient,
  ) {}

  handleConnection(socket: Socket): void {
    try {
      const token =
        socket.handshake?.auth?.token ||
        socket.handshake?.headers?.authorization?.split(' ')[1];
      if (!token) {
        socket.disconnect();
        return;
      }
      const adminInfo = this.configService.get('admin', { infer: true });
      const payload: any = verify(token, adminInfo.superAdminJwtSecret);
      if (!payload?.userId) {
        socket.disconnect();
        return;
      }
      socket.data.adminId = payload.userId;
      socket.data.adminRole = payload.role;
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket): void {
    for (const sessionId of [...this.watchers.keys()]) {
      this.dropWatcher(sessionId, socket.id);
    }
  }

  /**
   * Subscribes this admin to a session's stream, opening the upstream socket if
   * they are the first to watch it.
   */
  @SubscribeMessage('watch')
  async watch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { sessionId?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const sessionId = body?.sessionId;
    if (!sessionId) return { ok: false, error: 'sessionId is required' };

    try {
      // Refuses a session that does not exist, so an admin cannot sit in a room
      // waiting on frames that will never come.
      await this.client.get(sessionId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    void socket.join(sessionId);
    const watchers = this.watchers.get(sessionId) ?? new Set<string>();
    watchers.add(socket.id);
    this.watchers.set(sessionId, watchers);

    this.ensureUpstream(sessionId);
    return { ok: true };
  }

  @SubscribeMessage('input')
  input(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { sessionId?: string; event?: Record<string, unknown> },
  ): { ok: boolean; error?: string } {
    const sessionId = body?.sessionId;
    if (!sessionId || !body?.event) return { ok: false, error: 'sessionId and event are required' };
    // Only somebody already watching may drive it — the room membership is the
    // check, so a socket cannot type into a session it never joined.
    if (!this.watchers.get(sessionId)?.has(socket.id)) {
      return { ok: false, error: 'not watching this session' };
    }
    const upstream = this.upstreams.get(sessionId);
    if (!upstream?.connected) return { ok: false, error: 'the browser is not connected' };

    upstream.emit('input', { sessionId, event: body.event });
    return { ok: true };
  }

  /**
   * Anything that steers the page — a new URL, reload, back, the app-download
   * toggle — relayed to the browser and answered back.
   *
   * Only somebody already watching may steer, the same check as typing into it.
   */
  @SubscribeMessage('control')
  async control(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    body: { sessionId?: string; message?: string; payload?: Record<string, unknown> },
  ): Promise<{ ok: boolean; error?: string; currentUrl?: string }> {
    const sessionId = body?.sessionId;
    const message = body?.message;
    if (!sessionId || !message) return { ok: false, error: 'sessionId and message are required' };
    if (!this.watchers.get(sessionId)?.has(socket.id)) {
      return { ok: false, error: 'not watching this session' };
    }
    const upstream = this.upstreams.get(sessionId);
    if (!upstream?.connected) return { ok: false, error: 'the browser is not connected' };

    return new Promise((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, error: 'the browser did not answer' }),
        20000,
      );
      upstream.emit(message, { sessionId, ...(body.payload ?? {}) }, (reply: any) => {
        clearTimeout(timer);
        resolve(reply ?? { ok: false, error: 'no reply' });
      });
    });
  }

  @SubscribeMessage('unwatch')
  unwatch(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { sessionId?: string },
  ): { ok: boolean } {
    if (body?.sessionId) {
      void socket.leave(body.sessionId);
      this.dropWatcher(body.sessionId, socket.id);
    }
    return { ok: true };
  }

  private ensureUpstream(sessionId: string): void {
    if (this.upstreams.has(sessionId)) return;

    const upstream = io(`${this.client.baseUrl}/provider-browser`, {
      transports: ['websocket'],
      auth: { token: process.env.BROWSER_SERVICE_TOKEN?.trim() ?? '' },
      reconnection: true,
    });

    upstream.on('connect', () => {
      upstream.emit('watch', { sessionId });
    });
    upstream.on('frame', (payload: { data: string }) => {
      this.server?.to(sessionId).emit('frame', { sessionId, data: payload.data });
    });
    upstream.on('captured', (payload: unknown) => {
      this.server?.to(sessionId).emit('captured', payload);
    });
    upstream.on('blocked', (payload: { url: string }) => {
      // Worth surfacing: an admin who navigated somewhere the allowlist refuses
      // should see why the page stopped loading rather than a blank frame.
      this.server?.to(sessionId).emit('blocked', payload);
    });
    upstream.on('navigation-failed', (payload: { message: string }) => {
      this.server?.to(sessionId).emit('navigation-failed', payload);
    });
    upstream.on('closed', (payload: { reason: string }) => {
      this.server?.to(sessionId).emit('closed', payload);
      this.teardown(sessionId);
    });

    this.upstreams.set(sessionId, upstream);
  }

  private dropWatcher(sessionId: string, socketId: string): void {
    const watchers = this.watchers.get(sessionId);
    if (!watchers?.delete(socketId)) return;
    if (watchers.size > 0) return;

    // Nobody is watching. The browser session itself is left to its own TTL —
    // an admin whose tab reloaded should find it still there — but this
    // backend stops holding a socket open for it.
    this.teardown(sessionId);
  }

  private teardown(sessionId: string): void {
    this.watchers.delete(sessionId);
    const upstream = this.upstreams.get(sessionId);
    if (upstream) {
      upstream.removeAllListeners();
      upstream.disconnect();
      this.upstreams.delete(sessionId);
    }
  }

  onModuleDestroy(): void {
    for (const sessionId of [...this.upstreams.keys()]) {
      this.teardown(sessionId);
    }
  }
}
