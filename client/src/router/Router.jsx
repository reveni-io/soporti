import { Routes, Route, useParams } from 'react-router-dom'
import Chat from '../pages/Chat/Chat.jsx'
import Landing from '../pages/Landing/Landing.jsx'
import LoginPage from '../pages/LoginPage/LoginPage.jsx'
import AdminPage from '../pages/AdminPage/AdminPage.jsx'
import SharedView from '../pages/SharedView/SharedView.jsx'
import { ROUTES } from './constants.js'

// Share ids are hex strings; anything else falls through to the landing page
// (same behavior as the old manual pathname matching).
function ShareRoute() {
  const { shareId } = useParams()
  if (!/^[a-f0-9]+$/.test(shareId)) {
    return <Landing />
  }
  return <SharedView shareId={shareId} />
}

export default function Router() {
  return (
    <Routes>
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
      <Route path={ROUTES.CHAT} element={<Chat />} />
      {/* Wildcard: AdminPage routes its own sections (/admin/users, ...). */}
      <Route path={`${ROUTES.ADMIN}/*`} element={<AdminPage />} />
      <Route path={ROUTES.SHARE} element={<ShareRoute />} />
      {/* Landing page at the root (and any unknown path). */}
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
