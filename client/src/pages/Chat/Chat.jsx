import { useState } from 'react'
import { useChat } from './hooks/useChat/useChat.js'
import { useArtifacts } from './hooks/useArtifacts/useArtifacts.js'
import { useArtifactShare } from '../../hooks/useArtifactShare/useArtifactShare.js'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useAuthMethods } from '../../hooks/useAuthMethods/useAuthMethods.js'
import { useAuthedResource } from '../../hooks/useAuthedResource/useAuthedResource.js'
import { useSkills } from '../../hooks/useSkills/useSkills.js'
import Sidebar from './Sidebar/Sidebar.jsx'
import ChatPanel from './ChatPanel/ChatPanel.jsx'
import ArtifactPanel from './ArtifactPanel/ArtifactPanel.jsx'
import Login from '../../common/Login/Login.jsx'
import ShareModal from '../../common/ShareModal/ShareModal.jsx'
import SettingsModal from './SettingsModal/SettingsModal.jsx'
import SchedulesModal from './SchedulesModal/SchedulesModal.jsx'
import ArtifactsModal from './ArtifactsModal/ArtifactsModal.jsx'
import { YOLO_SOURCE } from '../../constants.js'
import { absoluteAppUrl, createShare, getIntegrations } from '../../services/services.js'
import './Chat.css'

export default function Chat({ initialQuestion = '' }) {
  const [selectedSources, setSelectedSources] = useState([YOLO_SOURCE])
  const [selectedProfile, setSelectedProfile] = useState(() => localStorage.getItem('selectedProfile') || 'support')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [conversationShareUrl, setConversationShareUrl] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [schedulesOpen, setSchedulesOpen] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const {
    token,
    isAuthenticated,
    loginWithGoogle,
    loginWithPassword,
    logout,
    error: authError,
    isLoggingIn,
  } = useAuth()
  const authMethods = useAuthMethods()
  const skills = useSkills(token, logout)
  const [integrationsReloadKey, setIntegrationsReloadKey] = useState(0)
  const integrations = useAuthedResource(getIntegrations, 'integrations', token, [], integrationsReloadKey)
  const artifacts = useArtifacts(token, logout)
  const artifactShare = useArtifactShare(token, logout)
  const {
    messages,
    isLoading,
    conversationKey,
    activeConversations,
    completedRuns,
    sendMessage,
    stopGeneration,
    newChat,
    loadConversation,
    sessionId,
  } = useChat(token, logout, artifacts.openPublished)

  if (!isAuthenticated) {
    return (
      <Login
        onLogin={authMethods?.google ? loginWithGoogle : undefined}
        onPasswordLogin={authMethods?.password ? loginWithPassword : undefined}
        error={authError}
        isLoading={isLoggingIn || authMethods === null}
      />
    )
  }

  function toggleSource(sourceId) {
    setSelectedSources(prev => {
      if (sourceId === YOLO_SOURCE) {
        return prev.includes(YOLO_SOURCE) ? prev.filter(s => s !== YOLO_SOURCE) : [YOLO_SOURCE]
      }
      const withoutYolo = prev.filter(s => s !== YOLO_SOURCE)
      return withoutYolo.includes(sourceId) ? withoutYolo.filter(s => s !== sourceId) : [...withoutYolo, sourceId]
    })
  }

  function handleProfileChange(profile) {
    setSelectedProfile(profile)
    localStorage.setItem('selectedProfile', profile)
  }

  function handleSend(text, skills = [], attachments = []) {
    sendMessage(text, selectedSources, selectedProfile, skills, attachments)
  }

  async function handleLoadConversation(id) {
    await loadConversation(id)
    setSidebarOpen(false)
  }

  function handleArtifactDeleted(artifactId) {
    if (artifactId === artifacts.openId) artifacts.close()
  }

  async function handleShare() {
    if (!sessionId) return
    try {
      const data = await createShare(token, sessionId)
      setConversationShareUrl(absoluteAppUrl(data.url))
    } catch (err) {
      console.error('Share failed:', err) // eslint-disable-line no-console
    }
  }

  return (
    <div className="chat-page">
      {sidebarOpen && <div className="chat-page__overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        selectedSources={selectedSources}
        onToggleSource={toggleSource}
        selectedProfile={selectedProfile}
        onSelectProfile={handleProfileChange}
        onNewChat={newChat}
        onLogout={logout}
        onOpenSchedules={() => setSchedulesOpen(true)}
        onOpenArtifacts={() => setArtifactsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onLoadConversation={handleLoadConversation}
        conversationsReloadKey={completedRuns}
        activeConversations={activeConversations}
        selectedConversationId={sessionId}
        integrations={integrations}
        token={token}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        conversationKey={conversationKey}
        onSend={handleSend}
        onStop={stopGeneration}
        hasSourcesSelected={selectedSources.length > 0}
        onOpenSidebar={() => setSidebarOpen(true)}
        onShare={handleShare}
        onLogout={logout}
        integrations={integrations}
        token={token}
        skills={skills.skills}
        initialQuestion={initialQuestion}
        onOpenArtifact={artifacts.openArtifact}
      />
      {artifacts.openId && (
        <ArtifactPanel
          artifactId={artifacts.openId}
          artifact={artifacts.artifact}
          html={artifacts.html}
          version={artifacts.version}
          loading={artifacts.loading}
          error={artifacts.error}
          onSelectVersion={artifacts.selectVersion}
          onShare={() => artifactShare.share(artifacts.openId, artifacts.version)}
          shareError={artifactShare.error}
          onDeleteVersion={artifacts.removeVersion}
          deleteError={artifacts.deleteError}
          onClose={artifacts.close}
        />
      )}
      {conversationShareUrl && (
        <ShareModal
          url={conversationShareUrl}
          title="Share conversation"
          onClose={() => setConversationShareUrl(null)}
        />
      )}
      {artifactShare.shareUrl && (
        <ShareModal url={artifactShare.shareUrl} title="Share artifact" onClose={artifactShare.dismiss} />
      )}
      {settingsOpen && (
        <SettingsModal
          token={token}
          onClose={() => setSettingsOpen(false)}
          onLogout={logout}
          skills={skills}
          selectedSources={selectedSources}
          onConnectionsChange={() => setIntegrationsReloadKey(key => key + 1)}
        />
      )}
      {artifactsOpen && (
        <ArtifactsModal
          token={token}
          onClose={() => setArtifactsOpen(false)}
          onLogout={logout}
          onDeleted={handleArtifactDeleted}
        />
      )}
      {schedulesOpen && (
        <SchedulesModal
          token={token}
          onClose={() => setSchedulesOpen(false)}
          onLogout={logout}
          selectedSources={selectedSources}
          selectedProfile={selectedProfile}
        />
      )}
    </div>
  )
}
