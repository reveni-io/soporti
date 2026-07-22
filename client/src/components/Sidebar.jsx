import { useState, useEffect } from 'react'
import { YOLO_SOURCE } from '../constants.js'
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
  token,
  isOpen,
  onClose,
}) {
  const [repos, setRepos] = useState([])
  const [integrations, setIntegrations] = useState([])
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function fetchRepos() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/repos`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout()
          return
        }
        if (!res.ok) throw new Error('Failed to fetch repos')
        const data = await res.json()
        setRepos(data.repos)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchRepos()
  }, [token, onLogout])

  useEffect(() => {
    async function fetchConversations() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setConversations(data.conversations || [])
        }
      } catch {}
    }
    fetchConversations()
  }, [token, conversationsReloadKey])

  async function handleDeleteConversation(e, id) {
    e.stopPropagation()
    setConversations(prev => prev.filter(c => c.id !== id))
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
  }

  useEffect(() => {
    async function fetchIntegrations() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/integrations`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setIntegrations(data.integrations || [])
        }
      } catch {}
    }
    fetchIntegrations()
  }, [token])

  const isYoloSelected = selectedSources.includes(YOLO_SOURCE)
  const specificSelectedCount = selectedSources.filter(s => s !== YOLO_SOURCE).length

  const q = search.toLowerCase()
  const filteredRepos = repos.filter(repo => {
    if (!search) return true
    return (
      repo.fullName.toLowerCase().includes(q) ||
      (repo.description && repo.description.toLowerCase().includes(q)) ||
      (repo.language && repo.language.toLowerCase().includes(q))
    )
  })
  // Always-on integrations (selectable: false) are not offered as sources.
  const filteredIntegrations = integrations.filter(integration => {
    if (integration.selectable === false) return false
    if (!search) return true
    return (
      integration.name.toLowerCase().includes(q) ||
      (integration.description && integration.description.toLowerCase().includes(q))
    )
  })
  const yoloMatchesSearch = !search || 'yolo'.includes(q) || 'auto'.includes(q)

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__header">
        <div className="sidebar__header-row">
          <h1 className="sidebar__title">Soporti</h1>
          <button className="sidebar__close" onClick={onClose} aria-label="Close sidebar">
            &times;
          </button>
        </div>
        <p className="sidebar__subtitle">Your AI teammate for code, data & docs</p>
      </div>

      <button className="sidebar__new-chat" onClick={onClearChat}>
        + New chat
      </button>

      {conversations.length > 0 && (
        <div className="sidebar__section sidebar__section--conversations">
          <h2 className="sidebar__section-title">Conversations</h2>
          <ul className="sidebar__conversation-list">
            {conversations.map(conv => (
              <li key={conv.id} className="sidebar__conversation" onClick={() => onLoadConversation?.(conv.id)}>
                <span className="sidebar__conversation-title">{conv.title || 'Untitled conversation'}</span>
                <button
                  className="sidebar__conversation-delete"
                  onClick={e => handleDeleteConversation(e, conv.id)}
                  aria-label="Delete conversation"
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sidebar__profile">
        <h2 className="sidebar__section-title">Profile</h2>
        <div className="sidebar__profile-toggle">
          <button
            className={`sidebar__profile-btn ${selectedProfile === 'support' ? 'sidebar__profile-btn--active' : ''}`}
            onClick={() => onSelectProfile('support')}
          >
            Support
          </button>
          <button
            className={`sidebar__profile-btn ${selectedProfile === 'tech' ? 'sidebar__profile-btn--active' : ''}`}
            onClick={() => onSelectProfile('tech')}
          >
            Tech
          </button>
        </div>
        <p className="sidebar__profile-hint">
          {selectedProfile === 'tech'
            ? 'Detailed code, architecture, and file paths'
            : 'Simplified explanations focused on behavior'}
        </p>
      </div>

      <div className="sidebar__section">
        <h2 className="sidebar__section-title">Sources ({specificSelectedCount})</h2>

        <input
          type="text"
          className="sidebar__search"
          placeholder="Search sources..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <ul className="sidebar__source-list">
          {yoloMatchesSearch && (
            <li
              key="yolo"
              className={`sidebar__source sidebar__source--yolo ${isYoloSelected ? 'sidebar__source--selected' : ''}`}
              onClick={() => onToggleSource(YOLO_SOURCE)}
            >
              <span className="sidebar__source-check">{isYoloSelected ? '✓' : ''}</span>
              <div className="sidebar__source-info">
                <span className="sidebar__source-name">YOLO (auto)</span>
                <span className="sidebar__source-desc">
                  Let the agent decide which sources to use based on your question
                </span>
              </div>
            </li>
          )}

          {filteredIntegrations.map(integration => {
            const key = `integration:${integration.id}`
            const isSelected = selectedSources.includes(key)
            return (
              <li
                key={key}
                className={`sidebar__source ${isSelected ? 'sidebar__source--selected' : ''}`}
                onClick={() => onToggleSource(key)}
              >
                <span className="sidebar__source-check">{isSelected ? '✓' : ''}</span>
                <div className="sidebar__source-info">
                  <span className="sidebar__source-name">{integration.name}</span>
                  <span className="sidebar__source-desc">{integration.description}</span>
                </div>
              </li>
            )
          })}

          {loading && <li className="sidebar__info">Loading repos...</li>}
          {error && <li className="sidebar__error">{error}</li>}

          {filteredRepos.map(repo => {
            const isSelected = selectedSources.includes(repo.fullName)
            return (
              <li
                key={repo.fullName}
                className={`sidebar__source ${isSelected ? 'sidebar__source--selected' : ''}`}
                onClick={() => onToggleSource(repo.fullName)}
              >
                <span className="sidebar__source-check">{isSelected ? '✓' : ''}</span>
                <div className="sidebar__source-info">
                  <span className="sidebar__source-name">{repo.fullName}</span>
                  {repo.language && <span className="sidebar__source-lang">{repo.language}</span>}
                  {repo.description && <span className="sidebar__source-desc">{repo.description}</span>}
                </div>
              </li>
            )
          })}
        </ul>

        {!loading && repos.length === 0 && !error && (
          <p className="sidebar__info">No repos found for this GitHub token.</p>
        )}
      </div>

      <div className="sidebar__footer">
        <button className="sidebar__settings" onClick={onOpenSettings}>
          Custom instructions
        </button>
        <button className="sidebar__logout" onClick={onLogout}>
          Log out
        </button>
      </div>
    </aside>
  )
}
