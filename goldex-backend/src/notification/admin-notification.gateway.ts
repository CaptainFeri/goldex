import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, Inject } from "@nestjs/common";
import { ConfigService, ConfigType } from "@nestjs/config";
import { verify } from "jsonwebtoken";
import appEnvConfig from "../config/app.env.config";
export interface AdminNotificationPayload {
  event: string;
  title: string;
  body: string;
  type?: string;
  metadata?: Record<string, any>;
}

/**
 * Real-time notification feed for the admin panel.
 * Authenticates the admin JWT on connection and broadcasts deposit/withdraw
 * events to every connected admin client.
 */
@WebSocketGateway({
  namespace: "admin-notifications",
  cors: { origin: "*", credentials: true },
})
export class AdminNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AdminNotificationGateway.name);

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<ConfigType<typeof appEnvConfig>>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake?.auth?.token || client.handshake?.headers?.authorization?.split(" ")[1];
      if (!token) {
        client.disconnect();
        return;
      }
      const adminInfo = this.configService.get("admin", { infer: true });
      const payload: any = verify(token, adminInfo.superAdminJwtSecret);
      if (!payload?.userId) {
        client.disconnect();
        return;
      }
      client.data.adminId = payload.userId;
      client.data.adminRole = payload.role;
      client.join("admins");
      this.logger.log(`Admin notification client connected: ${client.id} (admin ${payload.userId})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Admin notification client disconnected: ${client.id}`);
  }

  /**
   * Broadcast a notification to all connected admins.
   */
  sendToAdmins(notification: AdminNotificationPayload) {
    this.server.to("admins").emit("admin:notification", notification);
  }
}
