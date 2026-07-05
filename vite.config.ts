import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: ".",
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve("main-window.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  define: {
    __APP_DISPLAY_NAME__: JSON.stringify("SignFlow"),
  },
});
