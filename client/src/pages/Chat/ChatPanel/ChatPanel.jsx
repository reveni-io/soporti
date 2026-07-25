import { useState, useRef, useEffect, useMemo } from 'react'
import Message from '../../../common/Message/Message.jsx'
import GridPattern from '../../../common/GridPattern/GridPattern.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import TourModal from '../TourModal/TourModal.jsx'
import { useAuthedResource } from '../../../hooks/useAuthedResource/useAuthedResource.js'
import { SKILL_COMMAND_RE } from '../../../constants.js'
import { sampleExampleQuestions } from '../example-questions.js'
import './ChatPanel.css'

const TOUR_SEEN_KEY = 'soportiTourSeen'

export default function ChatPanel({
  messages,
  isLoading,
  onSend,
  onStop,
  hasSourcesSelected,
  onOpenSidebar,
  onShare,
  token,
  skills = [],
}) {
  const [input, setInput] = useState('')
  const [tourOpen, setTourOpen] = useState(() => !localStorage.getItem(TOUR_SEEN_KEY))
  const [menuDismissed, setMenuDismissed] = useState(false)
  const [menuIndex, setMenuIndex] = useState(0)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const highlightRef = useRef(null)

  const integrations = useAuthedResource('/api/integrations', 'integrations', token, [])
  const stats = useAuthedResource('/api/stats', 'stats', token, null)

  function syncHighlightScroll() {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
      syncHighlightScroll()
    }
  }, [input])

  const command = skills.length > 0 ? input.match(SKILL_COMMAND_RE) : null
  const invokedSkill = command ? (skills.find(s => s.name === command[1]) ?? null) : null
  const menuOpen = Boolean(command) && command[2] === undefined && !menuDismissed
  const matchingSkills = menuOpen ? skills.filter(s => s.name.startsWith(command[1])) : []

  const commandPrefix = invokedSkill ? `/${invokedSkill.name}` : ''
  const messageText = invokedSkill ? input.slice(commandPrefix.length).trim() : input.trim()

  function handleInputChange(e) {
    setInput(e.target.value)
    setMenuDismissed(false)
    setMenuIndex(0)
  }

  function selectSkill(skill) {
    setInput(`/${skill.name} `)
    textareaRef.current?.focus()
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!messageText || isLoading || !hasSourcesSelected) return
    onSend(messageText, invokedSkill ? [{ id: invokedSkill.id, name: invokedSkill.name }] : [])
    setInput('')
  }

  function handleKeyDown(e) {
    const navigable = matchingSkills.length > 0

    if (menuOpen && e.key === 'Escape') {
      e.preventDefault()
      setMenuDismissed(true)
      return
    }
    if (navigable && e.key === 'ArrowDown') {
      e.preventDefault()
      setMenuIndex(i => Math.min(i + 1, matchingSkills.length - 1))
      return
    }
    if (navigable && e.key === 'ArrowUp') {
      e.preventDefault()
      setMenuIndex(i => Math.max(i - 1, 0))
      return
    }
    if (navigable && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault()
      selectSkill(matchingSkills[menuIndex])
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const exampleQuestions = useMemo(() => sampleExampleQuestions(integrations), [integrations])

  const statTiles = useMemo(() => {
    if (!stats) return []
    const format = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
    return [
      { label: 'Conversations this week', value: stats.conversations },
      { label: 'Teammates this week', value: stats.activeUsers },
      { label: 'Solved cases learned', value: stats.solvedCases },
    ]
      .filter(tile => tile.value > 0)
      .map(tile => ({ ...tile, value: format.format(tile.value) }))
  }, [stats])

  function closeTour() {
    setTourOpen(false)
    localStorage.setItem(TOUR_SEEN_KEY, '1')
  }

  function handleTryExample(text) {
    setInput(text)
    textareaRef.current?.focus()
  }

  function handleTourExample(text) {
    closeTour()
    handleTryExample(text)
  }

  return (
    <div className="chat">
      <div className="chat__topbar">
        <button className="chat__menu-btn" onClick={onOpenSidebar} aria-label="Open sidebar">
          &#9776;
        </button>
        <span className="chat__topbar-title">Soporti</span>
        <button className="chat__tour-btn" onClick={() => setTourOpen(true)}>
          What can I ask?
        </button>
        {messages.length > 0 && onShare && (
          <button
            className="chat__share-btn"
            onClick={onShare}
            disabled={isLoading}
            title="Share conversation"
            aria-label="Share conversation"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M6 10L10 6M10 6H6.5M10 6V9.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        )}
      </div>
      <div className="chat__messages">
        {messages.length === 0 && (
          <div className="chat__empty">
            <GridPattern variant="light" />
            {hasSourcesSelected ? (
              <>
                <h2>Ask Soporti anything</h2>
                <p>
                  I can explore code, query data, read docs and help articles, and dig into tickets and errors using the
                  tools connected to this workspace.
                </p>
                {integrations.length > 0 && (
                  <div className="chat__capabilities">
                    {integrations.map(integration => (
                      <span
                        key={integration.id}
                        className="chip chip--pill chat__capability"
                        title={integration.description}
                      >
                        <IntegrationIcon id={integration.id} />
                        {integration.name}
                      </span>
                    ))}
                  </div>
                )}
                {exampleQuestions.length > 0 && (
                  <div className="chat__examples">
                    {exampleQuestions.map(question => (
                      <button key={question.text} onClick={() => handleTryExample(question.text)}>
                        {question.text}
                      </button>
                    ))}
                  </div>
                )}
                {statTiles.length > 0 && (
                  <div className="chat__stats">
                    {statTiles.map(tile => (
                      <div key={tile.label} className="chat__stat">
                        <span className="chat__stat-value">{tile.value}</span>
                        <span className="chat__stat-label">{tile.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2>Select a source to get started</h2>
                <p>Pick one or more sources (repos or integrations) from the sidebar, then ask your question.</p>
              </>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} message={msg} isStreaming={isLoading && i === messages.length - 1} token={token} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat__input-area" onSubmit={handleSubmit}>
        <div className="chat__input-wrapper">
          {menuOpen && (
            <ul className="chat__skill-menu" role="listbox">
              {matchingSkills.length === 0 ? (
                <li className="chat__skill-menu-empty">No matching skills</li>
              ) : (
                matchingSkills.map((skill, i) => (
                  <li
                    key={skill.id}
                    role="option"
                    aria-selected={i === menuIndex}
                    className={`chat__skill-menu-item${i === menuIndex ? ' chat__skill-menu-item--active' : ''}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      selectSkill(skill)
                    }}
                  >
                    <span className="chat__skill-menu-name">/{skill.name}</span>
                    {skill.description && <span className="chat__skill-menu-description">{skill.description}</span>}
                  </li>
                ))
              )}
            </ul>
          )}
          <div className="chat__input-field">
            {commandPrefix && (
              <div className="chat__input-highlight" ref={highlightRef} aria-hidden="true">
                <span className="chat__input-command">{commandPrefix}</span>
                {input.slice(commandPrefix.length)}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className={`chat__input${commandPrefix ? ' chat__input--overlaid' : ''}`}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={() => setMenuDismissed(true)}
              onScroll={syncHighlightScroll}
              placeholder={hasSourcesSelected ? 'Ask Soporti anything...' : 'Select a source from the sidebar first...'}
              rows={1}
              disabled={isLoading || !hasSourcesSelected}
            />
          </div>
          {isLoading ? (
            <button type="button" className="chat__btn chat__btn--stop" onClick={onStop} title="Stop">
              &#9632;
            </button>
          ) : (
            <button
              type="submit"
              className="chat__btn chat__btn--send"
              disabled={!messageText || !hasSourcesSelected}
              title="Send"
            >
              &#8593;
            </button>
          )}
        </div>
        <p className="chat__disclaimer">
          Soporti has read-only access to the connected tools. It does not execute code or make changes.
        </p>
      </form>

      {tourOpen && <TourModal integrations={integrations} onClose={closeTour} onTryExample={handleTourExample} />}
    </div>
  )
}
