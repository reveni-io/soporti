/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './context/AuthContext.jsx'
import App from './App.jsx'
import Landing from './components/Landing.jsx'
import LoginPage from './components/LoginPage.jsx'
import AdminPage from './components/AdminPage.jsx'
import SharedView from './components/SharedView.jsx'
import './index.css'
import './styles/ui.css'

// Share ids are hex strings; anything else falls through to the landing page
// (same behavior as the old manual pathname matching).
function ShareRoute() {
  const { shareId } = useParams()
  if (!/^[a-f0-9]+$/.test(shareId)) {
    return <Landing />
  }
  return <SharedView shareId={shareId} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/chat" element={<App />} />
            {/* Wildcard: AdminPage routes its own sections (/admin/users, ...). */}
            <Route path="/admin/*" element={<AdminPage />} />
            <Route path="/share/:shareId" element={<ShareRoute />} />
            {/* Landing page at the root (and any unknown path). */}
            <Route path="*" element={<Landing />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>
)
