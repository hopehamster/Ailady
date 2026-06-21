import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Phase 0: web dev server proxies /api → the local wrangler dev worker (default :8787).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
