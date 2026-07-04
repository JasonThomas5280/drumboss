import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/drumboss/',
  plugins: [react()],
  server: { host: true },
})
