import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support, registered after the first paint so it never competes with the render for
// bandwidth. BASE_URL, not a literal path: the scope has to follow the deploy, '/' on Vercel and
// '/pulse-studio/' on GitHub Pages. A failure here is silent on purpose — an unsupported browser,
// a private window, or an insecure origin all mean no offline mode, not a broken app.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}
