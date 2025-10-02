// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    https: true, // self-signed cert (dev only)
    host: true,  // expose on LAN (0.0.0.0)
    port: 5173
    
  }
  
})
