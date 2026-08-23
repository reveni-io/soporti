import { Routes, Route, useParams, useSearchParams } from 'react-router-dom'
import Chat from '../pages/Chat/Chat.jsx'
import Landing from '../pages/Landing/Landing.jsx'
import LoginPage from '../pages/LoginPage/LoginPage.jsx'
import AdminPage from '../pages/AdminPage/AdminPage.jsx'
import SharedView from '../pages/SharedView/SharedView.jsx'
import OAuthConsent from '../pages/OAuthConsent/OAuthConsent.jsx'
import Lmstfy from '../pages/Lmstfy/Lmstfy.jsx'
import ArtifactView from '../pages/ArtifactView/ArtifactView.jsx'
import SharedArtifact from '../pages/SharedArtifact/SharedArtifact.jsx'
import { QUESTION_PARAM, SHARE_ID_RE, UUID_RE } from '../constants.js'
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

function ArtifactRoute() {
  const { id } = useParams()
  if (!UUID_RE.test(id)) {
    return <Landing />
  }
  return <ArtifactView id={id} />
}

function SharedArtifactRoute() {
  const { shareId } = useParams()
  if (!SHARE_ID_RE.test(shareId)) {
    return <Landing />
  }
  return <SharedArtifact shareId={shareId} />
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
      <Route path={ROUTES.ARTIFACT} element={<ArtifactRoute />} />
      <Route path={ROUTES.ARTIFACT_SHARE} element={<SharedArtifactRoute />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}
