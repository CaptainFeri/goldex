import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4040',
        changeOrigin: true,
      },
      // socket.io (market price stream) — websocket upgrade proxied to backend
      '/socket.io': {
        target: 'http://localhost:4040',
        changeOrigin: true,
        ws: true,
      },
      // user-uploaded images (avatars) served by the backend's static mount
      '/uploads': {
        target: 'http://localhost:4040',
        changeOrigin: true,
      }
    }
  }
})
