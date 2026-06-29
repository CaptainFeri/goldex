import { io } from 'socket.io-client'

// Single shared connection to the backend "market" namespace. In dev, Vite
// proxies /socket.io (incl. the websocket upgrade) to the backend.
let socket = null

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
