import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = process.env.VITE_BACKEND_URL || 'http://localhost:4040'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
      // socket.io (market price stream) — websocket upgrade proxied to backend
      '/socket.io': {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
      },
      // user-uploaded images (avatars) served by the backend's static mount
      '/uploads': {
        target: BACKEND,
        changeOrigin: true,
      }
    }
  }
})
