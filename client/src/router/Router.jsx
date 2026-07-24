import { Routes, Route, useParams } from 'react-router-dom'
import Chat from '../pages/Chat/Chat.jsx'
import Landing from '../pages/Landing/Landing.jsx'
import LoginPage from '../pages/LoginPage/LoginPage.jsx'
import AdminPage from '../pages/AdminPage/AdminPage.jsx'
import SharedView from '../pages/SharedView/SharedView.jsx'
import { ROUTES } from './constants.js'

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
      <Route path={`${ROUTES.ADMIN}/*`} element={<AdminPage />} />
      <Route path={ROUTES.SHARE} element={<ShareRoute />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
