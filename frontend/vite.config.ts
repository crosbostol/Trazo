import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://localhost:5143" },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: { "/api": "http://localhost:5143" },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes("recharts") ? "charts" : undefined),
      },
    },
  },
});
