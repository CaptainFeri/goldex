import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// The admin SPA talks ONLY to the goldex-backend (JWT-secured). The backend's
// admin-monitoring module proxies the pricing-engine Redis, so there is no BFF.
var BACKEND = process.env.VITE_BACKEND_URL || "http://localhost:4040";
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5190,
        proxy: {
            "/api": {
                target: BACKEND,
                changeOrigin: true,
            },
            "/uploads": {
                target: BACKEND,
                changeOrigin: true,
            },
        },
    },
});
