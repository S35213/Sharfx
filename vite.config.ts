import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/Sharfx/' : '/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        owner: 'owner.html',
      },
    },
  },
})
