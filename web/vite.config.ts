import { defineConfig } from "vite"
import preact from "@preact/preset-vite"
import path from "node:path"

export default defineConfig({
  plugins: [preact()],
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
