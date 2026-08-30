import { io, Socket } from "socket.io-client";
import { getToken } from "../api/client";

/**
 * Real-time notification socket for the admin panel.
 * Connects to the `/admin-notifications` namespace authenticated with the
 * admin JWT and streams deposit/withdraw events to connected operators.
 */
class AdminNotificationSocket {
  private socket: Socket | null = null;

  connect(onNotification: (payload: any) => void): () => void {
    this.disconnect();
    const token = getToken();
    if (!token) return () => {};

    this.socket = io("/admin-notifications", {
      auth: { token },
      transports: ["websocket"],
    });

    this.socket.on("connect", () => {
      console.log("[admin-socket] connected");
    });

    this.socket.on("admin:notification", (payload: any) => {
      onNotification(payload);
    });

    this.socket.on("connect_error", (err) => {
      console.warn("[admin-socket] connect error", err.message);
    });

    return () => this.disconnect();
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const adminNotificationSocket = new AdminNotificationSocket();
