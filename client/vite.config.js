import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, ws: true },
      },
    },
  }
})
