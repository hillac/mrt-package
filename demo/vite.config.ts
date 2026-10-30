import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  base: './',
  build: { outDir: '../demo-dist', emptyOutDir: true },
  plugins: [react()],
})
