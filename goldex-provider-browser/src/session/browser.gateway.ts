import { Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SessionService } from './session.service';
import type { CapturedAuth } from './auth-capture';

/**
 * The live picture, and the clicks and keystrokes going back.
 *
 * Only the backend connects here — it holds the admin's socket and relays in
 * both directions — so the authentication that matters happened before this
 * point. The service token is checked again on connection so that a process
 * that somehow reached this port still cannot drive a browser.
 */
@WebSocketGateway({
  namespace: 'provider-browser',
  cors: { origin: false },
  maxHttpBufferSize: 2 * 1024 * 1024,
})
export class BrowserGateway implements OnGatewayConnection, OnModuleInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BrowserGateway.name);

  constructor(private readonly sessions: SessionService) {}

  onModuleInit(): void {
    this.sessions.bindEvents({
      onFrame: (sessionId, data) => {
        this.server?.to(sessionId).emit('frame', { sessionId, data });
      },
      onCaptured: (sessionId, captured: CapturedAuth) => {
        // Only that something was captured — the credentials themselves are
        // fetched over the authenticated HTTP route, not pushed down a stream.
        this.server?.to(sessionId).emit('captured', {
          sessionId,
          sourceUrl: captured.sourceUrl,
          fields: Object.keys(captured.auth),
        });
      },
      onClosed: (sessionId, reason) => {
        this.server?.to(sessionId).emit('closed', { sessionId, reason });
      },
      onBlocked: (sessionId, url) => {
        this.server?.to(sessionId).emit('blocked', { sessionId, url });
      },
      onNavigationFailed: (sessionId, message) => {
        this.server?.to(sessionId).emit('navigation-failed', { sessionId, message });
      },
    });
  }

  handleConnection(client: Socket): void {
    const expected = process.env.BROWSER_SERVICE_TOKEN?.trim();
    const presented = client.handshake?.auth?.token;
    if (!expected || presented !== expected) {
      this.logger.warn('Rejected a socket with no valid service token');
      client.disconnect();
    }
  }

  @SubscribeMessage('watch')
  watch(@ConnectedSocket() client: Socket, @MessageBody() body: { sessionId: string }) {
    if (!body?.sessionId) return { ok: false };
    // Throws if the session is gone, so a client cannot sit in a room for a
    // browser that no longer exists.
    this.sessions.get(body.sessionId);
    void client.join(body.sessionId);
    return { ok: true };
  }

  @SubscribeMessage('input')
  async input(
    @MessageBody() body: { sessionId: string; event: Record<string, any> },
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.sessions.dispatch(body.sessionId, body.event);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
