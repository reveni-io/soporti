import Icon from '../../../common/Icon/Icon.jsx'
import { useConversations } from '../hooks/useConversations/useConversations.js'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe/useDrawerSwipe.js'
import { useVideos } from '../../../hooks/useVideos/useVideos.js'
import ConversationList from './ConversationList/ConversationList.jsx'
import SidebarFooter from './SidebarFooter/SidebarFooter.jsx'
import SidebarHeader from './SidebarHeader/SidebarHeader.jsx'
import SidebarNav from './SidebarNav/SidebarNav.jsx'
import SourcePicker from './SourcePicker/SourcePicker.jsx'
import './Sidebar.css'

const NEW_CHAT_ICON_SIZE = 16
const NEW_CHAT_ICON_STROKE = 2.4

export default function Sidebar({
  selectedSources,
  onToggleSource,
  selectedProfile,
  onSelectProfile,
  onNewChat,
  onLogout,
  onOpenSchedules,
  onOpenArtifacts,
  onOpenSettings,
  onLoadConversation,
  conversationsReloadKey,
  activeConversations,
  selectedConversationId,
  hasUnreadBots = false,
  integrations,
  repos,
  token,
  user,
  isOpen,
  isCollapsed,
  onOpen,
  onClose,
  onCollapse,
}) {
  const { isGenerating: isVideoGenerating } = useVideos(token, onLogout)
  const {
    conversations,
    remove,
    query: conversationQuery,
    setQuery: setConversationQuery,
    searchedQuery: searchedConversationQuery,
  } = useConversations(token, conversationsReloadKey, activeConversations)
  const swipe = useDrawerSwipe({ isOpen, onOpen, onClose })

  const className = [
    'sidebar',
    isOpen && 'sidebar--open',
    isCollapsed && 'sidebar--collapsed',
    swipe.isDragging && 'sidebar--dragging',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <aside className={className} style={{ '--sidebar-drag': `${swipe.offset}px` }} {...swipe.drawerProps}>
      <div className="sidebar__inner">
        <SidebarHeader onClose={onClose} onCollapse={onCollapse} />

        <div className="sidebar__primary">
          <button type="button" className="sidebar__new-chat" onClick={onNewChat}>
            <Icon
              name="plus"
              size={NEW_CHAT_ICON_SIZE}
              strokeWidth={NEW_CHAT_ICON_STROKE}
              className="sidebar__new-chat-icon"
            />
            New chat
          </button>
        </div>

        <div className="sidebar__body">
          <SidebarNav
            isVideoGenerating={isVideoGenerating}
            hasUnreadBots={hasUnreadBots}
            onNavigate={onClose}
            onOpenArtifacts={onOpenArtifacts}
            onOpenSchedules={onOpenSchedules}
          />

          <ConversationList
            conversations={conversations}
            query={conversationQuery}
            searchedQuery={searchedConversationQuery}
            onQueryChange={setConversationQuery}
            selectedId={selectedConversationId}
            onSelect={onLoadConversation}
            onDelete={remove}
          />

          <SourcePicker
            selectedSources={selectedSources}
            onToggleSource={onToggleSource}
            selectedProfile={selectedProfile}
            onSelectProfile={onSelectProfile}
            repos={repos}
            integrations={integrations}
          />
        </div>

        <SidebarFooter user={user} onOpenSettings={onOpenSettings} onLogout={onLogout} />
      </div>
    </aside>
  )
}
