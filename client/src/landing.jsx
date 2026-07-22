/* Standalone entry for the public marketing landing page.
 *
 * This is the build target for GitHub Pages (see vite.landing.config.js): it
 * renders ONLY <Landing />, with no router, no auth providers and no API
 * calls, so the whole page is static. `hideCta` drops the login/app buttons,
 * which have no backend to point at on a static host. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Landing from './components/Landing.jsx'
import './index.css'
import './styles/ui.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Landing hideCta />
  </StrictMode>
)
