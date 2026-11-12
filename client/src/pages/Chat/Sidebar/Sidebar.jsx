import { YOLO_SOURCE } from '../../../constants.js'
import Icon from '../../../common/Icon/Icon.jsx'
import { useConversations } from '../hooks/useConversations/useConversations.js'
import { useRepos } from '../../../hooks/useRepos/useRepos.js'
import { useVideos } from '../../../hooks/useVideos/useVideos.js'
import { useSourceSearch } from '../hooks/useSourceSearch/useSourceSearch.js'
import ConversationList from './ConversationList/ConversationList.jsx'
import ProfileToggle from './ProfileToggle/ProfileToggle.jsx'
import SidebarFooter from './SidebarFooter/SidebarFooter.jsx'
import SidebarHeader from './SidebarHeader/SidebarHeader.jsx'
import SidebarNav from './SidebarNav/SidebarNav.jsx'
import SidebarSearch from './SidebarSearch/SidebarSearch.jsx'
import SourceList from './SourceList/SourceList.jsx'
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
  integrations,
  token,
  user,
  isOpen,
  isCollapsed,
  onClose,
  onCollapse,
}) {
  const { repos, loading, error } = useRepos(token, onLogout)
  const { isGenerating: isVideoGenerating } = useVideos(token, onLogout)
  const {
    conversations,
    remove,
    query: conversationQuery,
    setQuery: setConversationQuery,
    searchedQuery: searchedConversationQuery,
  } = useConversations(token, conversationsReloadKey, activeConversations)
  const { search, setSearch, filteredRepos, filteredIntegrations, yoloMatches } = useSourceSearch({
    repos,
    integrations,
  })

  const specificSelectedCount = selectedSources.filter(source => source !== YOLO_SOURCE).length
  const className = ['sidebar', isOpen && 'sidebar--open', isCollapsed && 'sidebar--collapsed']
    .filter(Boolean)
    .join(' ')

  return (
    <aside className={className}>
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

        <SidebarNav
          isVideoGenerating={isVideoGenerating}
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

        <ProfileToggle selectedProfile={selectedProfile} onSelectProfile={onSelectProfile} />

        <div className="sidebar__section sidebar__section--grow">
          <h2 className="sidebar__section-title">
            Sources{' '}
            {specificSelectedCount > 0 && (
              <span key={specificSelectedCount} className="sidebar__count">
                {specificSelectedCount}
              </span>
            )}
          </h2>

          <SidebarSearch value={search} label="Search sources" placeholder="Search sources..." onChange={setSearch} />

          <div className="sidebar__scroll">
            <SourceList
              repos={filteredRepos}
              integrations={filteredIntegrations}
              yoloMatches={yoloMatches}
              selectedSources={selectedSources}
              onToggleSource={onToggleSource}
              loadingRepos={loading}
              reposError={error}
            />

            {!loading && repos.length === 0 && !error && (
              <p className="sidebar__info">No repos found for this GitHub token.</p>
            )}
          </div>
        </div>

        <SidebarFooter user={user} onOpenSettings={onOpenSettings} onLogout={onLogout} />
      </div>
    </aside>
  )
}
