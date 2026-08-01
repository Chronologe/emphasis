import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  // HTTPS (selbstsigniert) ist nötig, damit crypto.subtle auch beim Zugriff
  // über die Netzwerk-IP (Handy) verfügbar ist – nur localhost gilt sonst als sicher.
  plugins: [react(), basicSsl()],
  server: {
    // Auto-Generierungs-Backend (npm run server) in der lokalen Entwicklung
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
