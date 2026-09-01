import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite proxies /api requests to the Express backend during development,
// so the frontend can just call fetch("/api/...") with no CORS headaches.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
