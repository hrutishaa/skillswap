import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } },
  server: { port: 5173, fs: { allow: ['..'] } },
})
