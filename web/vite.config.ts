import { defineConfig } from "vite"
import preact from "@preact/preset-vite"
import path from "node:path"
import basicSsl from "@vitejs/plugin-basic-ssl"

export default defineConfig({
  plugins: [basicSsl(), preact()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        ws: true,
      }
    }
  }
})
