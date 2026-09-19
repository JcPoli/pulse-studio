import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No `base` here: the default '/' is what Vercel, `vite dev` and `vite preview` need.
// GitHub Pages serves from /pulse-studio/, so .github/workflows/deploy.yml passes
// that base at build time instead.
export default defineConfig({
  plugins: [react()],
})
