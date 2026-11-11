import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Built into the leaderboard's own output, so one site serves both pages:
// /sprint/ locally and /leaderboard/sprint/ on GitHub Pages. A relative base
// works at either address.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: { outDir: '../dist/web/sprint', emptyOutDir: true },
  // The cards, the vote rules and the network code live in the repo root.
  server: { fs: { allow: ['..'] } },
})
