import { useState, useRef, useEffect } from 'react'
import { useChat } from './hooks/useChat/useChat.js'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useAuthMethods } from '../../hooks/useAuthMethods/useAuthMethods.js'
import { useAuthedResource } from '../../hooks/useAuthedResource/useAuthedResource.js'
import { useSkills } from '../../hooks/useSkills/useSkills.js'
import Sidebar from './Sidebar/Sidebar.jsx'
import ChatPanel from './ChatPanel/ChatPanel.jsx'
import Login from '../../common/Login/Login.jsx'
import ShareModal from './ShareModal/ShareModal.jsx'
import SettingsModal from './SettingsModal/SettingsModal.jsx'
import SchedulesModal from './SchedulesModal/SchedulesModal.jsx'
import { YOLO_SOURCE } from '../../constants.js'
import { createShare, getIntegrations } from '../../services/services.js'
import './Chat.css'

export default function Chat() {
  const [selectedSources, setSelectedSources] = useState([YOLO_SOURCE])
  const [selectedProfile, setSelectedProfile] = useState(() => localStorage.getItem('selectedProfile') || 'support')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [schedulesOpen, setSchedulesOpen] = useState(false)
  const [convReloadKey, setConvReloadKey] = useState(0)
  const wasLoading = useRef(false)
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
  const integrations = useAuthedResource(getIntegrations, 'integrations', token, [])
  const {
    messages,
    isLoading,
    conversationKey,
    sendMessage,
    stopGeneration,
    clearChat,
    loadConversation,
    currentSessionId,
  } = useChat(token, logout)

  useEffect(() => {
    if (wasLoading.current && !isLoading) {
      setConvReloadKey(k => k + 1)
    }
    wasLoading.current = isLoading
  }, [isLoading])

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

  function handleSend(text, skills = []) {
    sendMessage(text, selectedSources, selectedProfile, skills)
  }

  async function handleLoadConversation(id) {
    await loadConversation(id)
    setSidebarOpen(false)
  }

  async function handleShare() {
    const conversationId = currentSessionId.current
    if (!conversationId) return
    try {
      const data = await createShare(token, conversationId)
      setShareUrl(`${window.location.origin}${data.url}`)
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
        onClearChat={clearChat}
        onLogout={logout}
        onOpenSchedules={() => setSchedulesOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onLoadConversation={handleLoadConversation}
        conversationsReloadKey={convReloadKey}
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
        integrations={integrations}
        token={token}
        skills={skills.skills}
      />
      {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
      {settingsOpen && (
        <SettingsModal token={token} onClose={() => setSettingsOpen(false)} onLogout={logout} skills={skills} />
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
