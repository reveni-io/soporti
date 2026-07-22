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
// The landing reuses presentational chat pieces — HeroChat renders real
// `.message`/`.tool-call` markup, and CsvBlock/ChartBlock render `.csv-block`/
// `.chart-block` tables and charts. Their styles live in the chat CSS, which
// the full app loads globally but this standalone build must import explicitly,
// or the hero chat preview, CSV tables and charts render unstyled.
import './components/Message.css'
import './components/ToolCall.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Landing hideCta />
  </StrictMode>
)
