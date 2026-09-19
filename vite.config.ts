import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: '/pulse-studio/' is for GitHub Pages at https://<user>.github.io/pulse-studio/
// Change it to match the repo name, or set base: '/' when deploying to Vercel.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/pulse-studio/',
})
