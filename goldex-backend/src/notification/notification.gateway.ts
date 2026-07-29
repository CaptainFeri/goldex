import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { NotificationService } from "./notification.service";

@WebSocketGateway({
  namespace: "notifications",
  cors: { origin: "*", credentials: true },
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake?.auth?.token || client.handshake?.headers?.authorization?.split(" ")[1];
      if (!token) {
        client.disconnect();
        return;
      }
      const secret = (this.configService.get("user") as any)?.userJwtSecret;
      const payload: any = this.jwtService.verify(token, { secret });
      const userId = payload?.userId;
      if (!userId) {
        client.disconnect();
        return;
      }
      client.data.userId = userId;
      client.join(`user:${userId}`);
      this.logger.log(`Notification client connected: ${client.id} for user ${userId}`);

      const unreadCount = await this.notificationService.getUnreadCount(userId);
      client.emit("unread-count", { count: unreadCount });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Notification client disconnected: ${client.id}`);
  }

  @SubscribeMessage("mark-read")
  async handleMarkRead(@ConnectedSocket() client: Socket, data: { id: string }) {
    const userId = client.data.userId;
    if (!userId) return;
    await this.notificationService.markAsRead(data.id, userId);
    const unreadCount = await this.notificationService.getUnreadCount(userId);
    this.server.to(`user:${userId}`).emit("unread-count", { count: unreadCount });
  }

  @SubscribeMessage("mark-all-read")
  async handleMarkAllRead(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    await this.notificationService.markAllAsRead(userId);
    this.server.to(`user:${userId}`).emit("unread-count", { count: 0 });
  }

  sendNewNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit("notification:new", notification);
    this.server.to(`user:${userId}`).emit("unread-count", { count: notification.unreadCount || 1 });
  }
}
