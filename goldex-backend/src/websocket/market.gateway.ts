// market.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { MarketService } from "./market.service";

@WebSocketGateway({
  namespace: "market",
  cors: {
    origin: "*",
    credentials: true,
  },
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MarketGateway.name);
  private socketPairs: Map<string, Set<string>> = new Map();
  private streamingCallbacks: Map<string, Function> = new Map();

  constructor(private marketService: MarketService) {}

  async handleConnection(client: Socket) {
    this.logger.log(`✅ Client connected: ${client.id}`);
    this.socketPairs.set(client.id, new Set());

    client.emit("connected", {
      message: "Connected to market WebSocket",
      socketId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`❌ Client disconnected: ${client.id}`);

    const subscribedPairs = this.socketPairs.get(client.id);
    if (subscribedPairs) {
      for (const pair of subscribedPairs) {
        await this.checkAndStopStreaming(pair);
      }
    }
    this.socketPairs.delete(client.id);
  }

  @SubscribeMessage("subscribe-prices")
  async handleSubscribePrices(@ConnectedSocket() client: Socket, @MessageBody() data: { pairs: string[] }) {
    try {
      const pairs = data.pairs;
      const socketId = client.id;

      this.logger.log(`📡 Client ${socketId} subscribing to: ${pairs.join(", ")}`);

      // Store subscriptions
      if (!this.socketPairs.has(socketId)) {
        this.socketPairs.set(socketId, new Set());
      }
      const subscriptions = this.socketPairs.get(socketId);

      for (const pair of pairs) {
        subscriptions.add(pair);
      }

      // Send initial prices
      const initialPrices = await this.marketService.getMultiplePrices(pairs);
      this.logger.log(`💰 Sending initial prices: ${JSON.stringify(initialPrices)}`);

      if (Object.keys(initialPrices).length > 0) {
        client.emit("price-update", initialPrices);
      } else {
        client.emit("price-error", { message: "No price data available", pairs });
      }

      // Setup streaming - expand __all__ to actual pair keys
      const allPairs = pairs.includes("__all__")
        ? Array.from(this.marketService.getCachedPairKeys())
        : pairs;

      for (const pair of allPairs) {
        if (!this.streamingCallbacks.has(pair)) {
          const callback = (priceData: any) => {
            this.broadcastToSubscribers(pair, priceData);
          };
          this.streamingCallbacks.set(pair, callback);
          await this.marketService.startStreaming([pair], callback);
        }
      }

      return { success: true, message: "Subscribed to price updates" };
    } catch (error) {
      this.logger.error(`Subscribe error: ${(error as any).message}`);
      throw error;
    }
  }

  @SubscribeMessage("unsubscribe-prices")
  async handleUnsubscribePrices(@ConnectedSocket() client: Socket, @MessageBody() data: { pairs: string[] }) {
    const pairs = data.pairs;
    const socketId = client.id;

    this.logger.log(`Client ${socketId} unsubscribing from: ${pairs.join(", ")}`);

    const subscriptions = this.socketPairs.get(socketId);
    if (subscriptions) {
      for (const pair of pairs) {
        subscriptions.delete(pair);
      }
    }

    for (const pair of pairs) {
      await this.checkAndStopStreaming(pair);
    }

    return { success: true };
  }

  @SubscribeMessage("get-market-data")
  async handleGetMarketData(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { baseCode?: string; quoteCode?: string; limit?: number }
  ) {
    try {
      const marketData = await this.marketService.getMarketData(data.baseCode, data.quoteCode, data.limit || 50);
      client.emit("market-data", marketData);
      return { success: true };
    } catch (error) {
      this.logger.error(`Get market data error: ${(error as any).message}`);
      throw error;
    }
  }

  @SubscribeMessage("get-pair-details")
  async handleGetPairDetails(@ConnectedSocket() client: Socket, @MessageBody() data: { pairId: string }) {
    try {
      // Implement pair details logic
      client.emit("pair-details", { pairId: data.pairId });
      return { success: true };
    } catch (error) {
      this.logger.error(`Get pair details error: ${(error as any).message}`);
      throw error;
    }
  }

  private broadcastToSubscribers(pair: string, priceData: any) {
    // FIX: Check if server is initialized
    if (!this.server) {
      this.logger.warn(`Cannot broadcast: server not initialized yet`);
      return;
    }

    // Get all connected sockets
    const sockets = this.server.sockets;
    if (!sockets) {
      this.logger.warn(`Cannot broadcast: sockets not available`);
      return;
    }

    // Find all sockets subscribed to this pair
    let broadcastCount = 0;
    for (const [socketId, subscriptions] of this.socketPairs.entries()) {
      // A client may subscribe to specific pairs or to "__all__" (everything).
      if (subscriptions.has(pair) || subscriptions.has("__all__")) {
        try {
          // Method 1: Get socket by ID
          const socket = sockets.sockets?.get(socketId);
          if (socket && socket.connected) {
            const updateData = { [pair]: priceData };
            socket.emit("price-update", updateData);
            broadcastCount++;
            this.logger.debug(`Broadcasted to ${socketId}`);
          } else {
            // Method 2: Try to emit to room (alternative)
            this.server.to(socketId).emit("price-update", { [pair]: priceData });
            broadcastCount++;
          }
        } catch (error) {
          this.logger.error(`Error broadcasting to ${socketId}: ${(error as any).message}`);
        }
      }
    }

    if (broadcastCount > 0) {
      this.logger.debug(`Broadcasted update for ${pair} to ${broadcastCount} clients`);
    } else if (this.socketPairs.size > 0) {
      this.logger.debug(`No subscribers found for ${pair}, skipping broadcast`);
    }
  }

  private async checkAndStopStreaming(pair: string) {
    // Check if any socket is still subscribed
    let hasSubscribers = false;
    for (const subscriptions of this.socketPairs.values()) {
      if (subscriptions.has(pair)) {
        hasSubscribers = true;
        break;
      }
    }

    if (!hasSubscribers && this.streamingCallbacks.has(pair)) {
      await this.marketService.stopStreaming([pair]);
      this.streamingCallbacks.delete(pair);
      this.logger.log(`Stopped streaming for ${pair}`);
    }
  }
}
