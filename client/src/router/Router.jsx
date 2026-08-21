import { Routes, Route, useParams, useSearchParams } from 'react-router-dom'
import Chat from '../pages/Chat/Chat.jsx'
import Landing from '../pages/Landing/Landing.jsx'
import LoginPage from '../pages/LoginPage/LoginPage.jsx'
import AdminPage from '../pages/AdminPage/AdminPage.jsx'
import SharedView from '../pages/SharedView/SharedView.jsx'
import OAuthConsent from '../pages/OAuthConsent/OAuthConsent.jsx'
import Lmstfy from '../pages/Lmstfy/Lmstfy.jsx'
import { QUESTION_PARAM } from '../constants.js'
import { ROUTES } from './constants.js'

function ChatRoute() {
  const [searchParams] = useSearchParams()

  return <Chat initialQuestion={searchParams.get(QUESTION_PARAM) ?? ''} />
}

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
      <Route path={ROUTES.CHAT} element={<ChatRoute />} />
      <Route path={`${ROUTES.ADMIN}/*`} element={<AdminPage />} />
      <Route path={ROUTES.SHARE} element={<ShareRoute />} />
      <Route path={ROUTES.OAUTH_CONSENT} element={<OAuthConsent />} />
      <Route path={ROUTES.LMSTFY} element={<Lmstfy />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
