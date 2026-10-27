import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => ({
  base: mode === "demo" ? "./" : "/",
  define: {
    "import.meta.env.STATIC_DEMO": JSON.stringify(mode === "demo"),
  },
  build: { outDir: mode === "demo" ? "dist-demo" : "dist" },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/rest": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:18080",
        changeOrigin: true,
      },
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:18080",
        changeOrigin: true,
      },
    },
  },
}));
