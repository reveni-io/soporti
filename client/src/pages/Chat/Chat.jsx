import { useState } from 'react'
import { useChat } from './hooks/useChat/useChat.js'
import { useArtifacts } from './hooks/useArtifacts/useArtifacts.js'
import { useBots } from './hooks/useBots/useBots.js'
import { useChatView } from './hooks/useChatView/useChatView.js'
import { useOpenBot } from './hooks/useOpenBot/useOpenBot.js'
import { useArtifactShare } from '../../hooks/useArtifactShare/useArtifactShare.js'
import { useAuth } from '../../hooks/useAuth/useAuth.js'
import { useAuthMethods } from '../../hooks/useAuthMethods/useAuthMethods.js'
import { useAuthedResource } from '../../hooks/useAuthedResource/useAuthedResource.js'
import { useSkills } from '../../hooks/useSkills/useSkills.js'
import Sidebar from './Sidebar/Sidebar.jsx'
import ChatPanel from './ChatPanel/ChatPanel.jsx'
import ArtifactPanel from './ArtifactPanel/ArtifactPanel.jsx'
import Login from '../../common/Login/Login.jsx'
import ScreenTransition from '../../common/ScreenTransition/ScreenTransition.jsx'
import ShareModal from '../../common/ShareModal/ShareModal.jsx'
import SettingsModal from './SettingsModal/SettingsModal.jsx'
import SchedulesModal from './SchedulesModal/SchedulesModal.jsx'
import ArtifactsModal from './ArtifactsModal/ArtifactsModal.jsx'
import BotsPanel from './BotsPanel/BotsPanel.jsx'
import BotNotFound from './BotNotFound/BotNotFound.jsx'
import BotFormModal from './BotFormModal/BotFormModal.jsx'
import RoutinesModal from './RoutinesModal/RoutinesModal.jsx'
import { DEFAULT_PROFILE, YOLO_SOURCE } from '../../constants.js'
import { absoluteAppUrl, createShare, getIntegrations } from '../../services/services.js'
import './Chat.css'

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed'
const BOT_FORM_CREATE = 'create'
const BOT_FORM_EDIT = 'edit'
const BOT_SOURCES = [YOLO_SOURCE]

function hasUnread(bot) {
  return bot.unreadCount > 0
}

export default function Chat({ initialQuestion = '' }) {
  const [selectedSources, setSelectedSources] = useState([YOLO_SOURCE])
  const [selectedProfile, setSelectedProfile] = useState(
    () => localStorage.getItem('selectedProfile') || DEFAULT_PROFILE
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  )
  const [conversationShareUrl, setConversationShareUrl] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [schedulesOpen, setSchedulesOpen] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(false)
  const [botForm, setBotForm] = useState(null)
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const {
    token,
    user,
    isAuthenticated,
    loginWithGoogle,
    loginWithPassword,
    logout,
    error: authError,
    isLoggingIn,
  } = useAuth()
  const authMethods = useAuthMethods()
  const view = useChatView()
  const bots = useBots(token, logout)
  const bot = bots.bots.find(candidate => candidate.id === view.botId) ?? null
  const skills = useSkills(token, logout)
  const [integrationsReloadKey, setIntegrationsReloadKey] = useState(0)
  const integrations = useAuthedResource(getIntegrations, {
    key: 'integrations',
    token,
    initialValue: [],
    reloadKey: integrationsReloadKey,
  })
  const artifacts = useArtifacts(token, logout)
  const artifactShare = useArtifactShare(token, logout)
  const {
    messages,
    isLoading,
    isFetching,
    fetchError,
    conversationKey,
    activeConversations,
    completedRuns,
    sendMessage,
    stopGeneration,
    newChat,
    loadConversation,
    openBot,
    refreshBot,
    sessionId,
  } = useChat(token, logout, artifacts.openPublished, view.botId)
  useOpenBot({
    token,
    botId: view.botId,
    unreadCount: bot?.unreadCount ?? 0,
    isLoading,
    openBot,
    refreshBot,
    reloadBots: bots.reload,
    onLogout: logout,
  })

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

  function handleSidebarCollapsed(collapsed) {
    setIsSidebarCollapsed(collapsed)
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
  }

  function handleSend(text, skills = [], attachments = []) {
    if (bot) {
      sendMessage(text, { selectedSources: BOT_SOURCES, profile: bot.profile, skills, attachments })
      return
    }

    sendMessage(text, { selectedSources, profile: selectedProfile, skills, attachments })
  }

  function handleNewChat() {
    newChat()
    view.showChat()
  }

  async function handleLoadConversation(id) {
    view.showChat()
    await loadConversation(id)
    setSidebarOpen(false)
  }

  async function handleBotCreated(created) {
    await bots.reload()
    setBotForm(null)
    view.showBot(created.id)
  }

  async function handleBotUpdated() {
    await bots.reload()
    setBotForm(null)
  }

  async function handleBotDeleted() {
    setBotForm(null)
    setRoutinesOpen(false)
    view.showBots()
    await bots.reload()
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
      <div
        className={`chat-page__overlay ${sidebarOpen ? 'chat-page__overlay--visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <Sidebar
        selectedSources={selectedSources}
        onToggleSource={toggleSource}
        selectedProfile={selectedProfile}
        onSelectProfile={handleProfileChange}
        onNewChat={handleNewChat}
        onLogout={logout}
        onOpenSchedules={() => setSchedulesOpen(true)}
        onOpenArtifacts={() => setArtifactsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onLoadConversation={handleLoadConversation}
        conversationsReloadKey={completedRuns}
        activeConversations={activeConversations}
        selectedConversationId={view.isChatView ? sessionId : null}
        hasUnreadBots={bots.bots.some(hasUnread)}
        integrations={integrations}
        token={token}
        user={user}
        isOpen={sidebarOpen}
        isCollapsed={isSidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onCollapse={() => handleSidebarCollapsed(true)}
      />
      {view.isBotsView && (
        <ScreenTransition>
          <BotsPanel
            bots={bots.bots}
            loading={bots.loading}
            error={bots.error}
            onCreate={() => setBotForm(BOT_FORM_CREATE)}
            isSidebarCollapsed={isSidebarCollapsed}
            onOpenSidebar={() => setSidebarOpen(true)}
            onExpandSidebar={() => handleSidebarCollapsed(false)}
          />
        </ScreenTransition>
      )}
      {view.isBotView && !bot && (
        <ScreenTransition>
          <BotNotFound loading={bots.loading} />
        </ScreenTransition>
      )}
      {(view.isChatView || bot) && (
        <ScreenTransition animatesUpdates>
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            conversationKey={conversationKey}
            onSend={handleSend}
            onStop={stopGeneration}
            hasSourcesSelected={Boolean(bot) || selectedSources.length > 0}
            onOpenSidebar={() => setSidebarOpen(true)}
            isSidebarCollapsed={isSidebarCollapsed}
            onExpandSidebar={() => handleSidebarCollapsed(false)}
            onShare={handleShare}
            onLogout={logout}
            integrations={integrations}
            token={token}
            skills={skills.skills}
            initialQuestion={initialQuestion}
            onOpenArtifact={artifacts.openArtifact}
            bot={bot}
            isFetching={isFetching}
            fetchError={fetchError}
            onOpenRoutines={() => setRoutinesOpen(true)}
            onEditBot={() => setBotForm(BOT_FORM_EDIT)}
          />
        </ScreenTransition>
      )}
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
      {botForm && (
        <BotFormModal
          bot={botForm === BOT_FORM_EDIT ? bot : null}
          token={token}
          onClose={() => setBotForm(null)}
          onLogout={logout}
          onCreated={handleBotCreated}
          onUpdated={handleBotUpdated}
          onDeleted={handleBotDeleted}
        />
      )}
      {routinesOpen && bot && (
        <RoutinesModal bot={bot} token={token} onClose={() => setRoutinesOpen(false)} onLogout={logout} />
      )}
    </div>
  )
}
