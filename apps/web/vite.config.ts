import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Phase 0: web dev server proxies /api → the local wrangler dev worker (default :8787).
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 explicitly. On this Windows host "localhost" resolved to ::1, so Vite
    // bound IPv6-only and the headless browser (which tries 127.0.0.1 first) hung. Pin it.
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
