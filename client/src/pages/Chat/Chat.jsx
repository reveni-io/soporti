import { useState, useRef, useEffect } from 'react'
import { useChat } from './hooks/useChat/useChat.js'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useAuthMethods } from '../../hooks/useAuthMethods/useAuthMethods.js'
import Sidebar from './Sidebar/Sidebar.jsx'
import ChatPanel from './ChatPanel/ChatPanel.jsx'
import Login from '../../common/Login/Login.jsx'
import ShareModal from './ShareModal/ShareModal.jsx'
import SettingsModal from './SettingsModal/SettingsModal.jsx'
import { YOLO_SOURCE } from '../../constants.js'
import './Chat.css'

export default function Chat() {
  const [selectedSources, setSelectedSources] = useState([YOLO_SOURCE])
  const [selectedProfile, setSelectedProfile] = useState(() => localStorage.getItem('selectedProfile') || 'support')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [convReloadKey, setConvReloadKey] = useState(0)
  const currentShareId = useRef(null)
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
  const {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    clearChat: originalClearChat,
    loadConversation,
  } = useChat(token, logout)

  // Refresh the sidebar history whenever a turn finishes (new conversations and
  // updated titles become visible without a manual reload).
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

  function handleSend(text) {
    sendMessage(text, selectedSources, selectedProfile)
  }

  function handleClearChat() {
    originalClearChat()
    currentShareId.current = null
  }

  async function handleLoadConversation(id) {
    currentShareId.current = null
    await loadConversation(id)
    setSidebarOpen(false)
  }

  async function handleShare() {
    try {
      const body = { messages }
      if (currentShareId.current) {
        body.shareId = currentShareId.current
      }

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Failed to create share')

      const data = await res.json()
      currentShareId.current = data.shareId
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
        onClearChat={handleClearChat}
        onLogout={logout}
        onOpenSettings={() => setSettingsOpen(true)}
        onLoadConversation={handleLoadConversation}
        conversationsReloadKey={convReloadKey}
        token={token}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        onSend={handleSend}
        onStop={stopGeneration}
        hasSourcesSelected={selectedSources.length > 0}
        onOpenSidebar={() => setSidebarOpen(true)}
        onShare={handleShare}
        token={token}
      />
      {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}
      {settingsOpen && <SettingsModal token={token} onClose={() => setSettingsOpen(false)} onLogout={logout} />}
    </div>
  )
}
