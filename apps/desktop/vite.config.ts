import { defineConfig } from "vite";

// Tauri expects a fixed port and fails if it's taken, instead of silently moving.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
