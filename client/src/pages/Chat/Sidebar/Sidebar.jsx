import { YOLO_SOURCE } from '../../../constants.js'
import { useConversations } from '../hooks/useConversations/useConversations.js'
import { useRepos } from '../hooks/useRepos/useRepos.js'
import { useSourceSearch } from '../hooks/useSourceSearch/useSourceSearch.js'
import ConversationList from './ConversationList/ConversationList.jsx'
import ProfileToggle from './ProfileToggle/ProfileToggle.jsx'
import SidebarFooter from './SidebarFooter/SidebarFooter.jsx'
import SidebarHeader from './SidebarHeader/SidebarHeader.jsx'
import SourceList from './SourceList/SourceList.jsx'
import './Sidebar.css'

export default function Sidebar({
  selectedSources,
  onToggleSource,
  selectedProfile,
  onSelectProfile,
  onClearChat,
  onLogout,
  onOpenSettings,
  onLoadConversation,
  conversationsReloadKey,
  integrations,
  token,
  isOpen,
  onClose,
}) {
  const { repos, loading, error } = useRepos(token, onLogout)
  const { conversations, remove } = useConversations(token, conversationsReloadKey)
  const { search, setSearch, filteredRepos, filteredIntegrations, yoloMatches } = useSourceSearch({
    repos,
    integrations,
  })

  const specificSelectedCount = selectedSources.filter(source => source !== YOLO_SOURCE).length

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <SidebarHeader onClose={onClose} />

      <button className="sidebar__new-chat" onClick={onClearChat}>
        + New chat
      </button>

      <ConversationList conversations={conversations} onSelect={onLoadConversation} onDelete={remove} />

      <ProfileToggle selectedProfile={selectedProfile} onSelectProfile={onSelectProfile} />

      <div className="sidebar__section">
        <h2 className="sidebar__section-title">Sources ({specificSelectedCount})</h2>

        <input
          type="text"
          className="sidebar__search"
          placeholder="Search sources..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />

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

      <SidebarFooter onOpenSettings={onOpenSettings} onLogout={onLogout} />
    </aside>
  )
}
