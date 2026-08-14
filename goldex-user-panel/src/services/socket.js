import { io } from 'socket.io-client'
import { tokens } from './http'

// Single shared connection to the backend "market" namespace. In dev, Vite
// proxies /socket.io (incl. the websocket upgrade) to the backend.
let socket = null
let notificationSocket = null

export function getMarketSocket() {
  if (!socket) {
    socket = io('/market', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000
    })
  }
  return socket
}

// Authenticated realtime connection to the "notifications" namespace. The
// backend gateway verifies the JWT from handshake.auth.token.
export function getNotificationSocket() {
  if (!notificationSocket) {
    notificationSocket = io('/notifications', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      auth: { token: tokens.access }
    })
  }
  return notificationSocket
}

export function resetNotificationSocket() {
  if (notificationSocket) {
    notificationSocket.disconnect()
    notificationSocket = null
  }
}
