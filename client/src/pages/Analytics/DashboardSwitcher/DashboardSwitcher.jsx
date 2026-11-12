import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../../common/Icon/Icon.jsx'
import { dashboardPath } from '../dashboard-path.js'
import './DashboardSwitcher.css'

const ITEM_SELECTOR = '[role="menuitem"]'
const CURRENT_ITEM_SELECTOR = '[aria-current="page"]'
const FOCUS_MOVES = {
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
}

function isOwned(dashboard) {
  return dashboard.isOwner
}

function isSharedByOthers(dashboard) {
  return !dashboard.isOwner
}

export default function DashboardSwitcher({ current, dashboards, onCreate }) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()

  const sharedByOthers = dashboards.filter(isSharedByOthers)

  useEffect(() => {
    if (!isOpen) return

    const menu = menuRef.current
    const startingItem = menu.querySelector(CURRENT_ITEM_SELECTOR) ?? menu.querySelector(ITEM_SELECTOR)

    function handlePointerDown(event) {
      if (!rootRef.current.contains(event.target)) setIsOpen(false)
    }

    startingItem.focus()
    document.addEventListener('pointerdown', handlePointerDown)

    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  function close() {
    setIsOpen(false)
    buttonRef.current.focus()
  }

  function moveFocus(move) {
    const items = [...menuRef.current.querySelectorAll(ITEM_SELECTOR)]

    items[move(items.indexOf(document.activeElement), items.length)].focus()
  }

  function handleClosedKeyDown(event) {
    if (event.key !== 'ArrowDown') return

    event.preventDefault()
    setIsOpen(true)
  }

  function handleOpenKeyDown(event) {
    if (event.key === 'Tab') {
      setIsOpen(false)
      return
    }

    const move = FOCUS_MOVES[event.key]
    if (!move && event.key !== 'Escape') return

    event.preventDefault()
    if (move) moveFocus(move)
    else close()
  }

  function handleCreate() {
    setIsOpen(false)
    onCreate()
  }

  return (
    <div ref={rootRef} className="dashboard-switcher" onKeyDown={isOpen ? handleOpenKeyDown : handleClosedKeyDown}>
      <h1 className="dashboard-switcher__heading">
        <button
          ref={buttonRef}
          type="button"
          className="dashboard-switcher__button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          onClick={() => setIsOpen(wasOpen => !wasOpen)}
        >
          <span className="dashboard-switcher__name">{current.name}</span>
          <svg
            className="dashboard-switcher__chevron"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </h1>

      {isOpen && (
        <div ref={menuRef} id={menuId} className="card dashboard-switcher__menu" role="menu" aria-label="Dashboards">
          <MenuGroup
            label="Your dashboards"
            dashboards={dashboards.filter(isOwned)}
            currentId={current.id}
            onSelect={close}
          />
          {sharedByOthers.length > 0 && (
            <MenuGroup
              label="Shared with the team"
              dashboards={sharedByOthers}
              currentId={current.id}
              showsOwner
              onSelect={close}
            />
          )}

          <hr className="dashboard-switcher__divider" />
          <button type="button" className="dashboard-switcher__item" role="menuitem" onClick={handleCreate}>
            New dashboard
          </button>
        </div>
      )}
    </div>
  )
}

function MenuGroup({ label, dashboards, currentId, showsOwner, onSelect }) {
  const labelId = useId()

  return (
    <div className="dashboard-switcher__group" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="dashboard-switcher__group-label">
        {label}
      </p>
      {dashboards.map(dashboard => (
        <Link
          key={dashboard.id}
          className="dashboard-switcher__item"
          role="menuitem"
          to={dashboardPath(dashboard.id)}
          aria-current={dashboard.id === currentId ? 'page' : undefined}
          onClick={onSelect}
        >
          <span className="dashboard-switcher__item-name">{dashboard.name}</span>{' '}
          {showsOwner && <span className="dashboard-switcher__item-owner">by {dashboard.ownerName}</span>}
          {dashboard.id === currentId && <Icon name="check" size={14} className="dashboard-switcher__check" />}
        </Link>
      ))}
    </div>
  )
}
