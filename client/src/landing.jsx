import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Landing from './pages/Landing/Landing.jsx'
import './index.css'
import './styles/ui.css'
import './common/Message/Message.css'
import './common/ToolCall/ToolCall.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Landing hideCta />
  </StrictMode>
)
