import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      protocolImports: true,
    }),
  ],

  server: {
    port: 5173,
    // Increase header size limits
    middlewareMode: false,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
    },
    // Increase max header size
    httpServer: {
      maxHeaderSize: 128 * 1024, // 128 KB
    },
  },

  resolve: {
    alias: {
      process: 'process/browser',
      buffer: 'buffer',
      stream: 'stream-browserify',
      util: 'util',
      crypto: 'crypto-browserify',
    },
  },
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  optimizeDeps: {
    include: [
      'buffer',
      'process',
      'util',
      'stream-browserify',
      'crypto-browserify',
    ],
  },
})