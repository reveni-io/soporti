import { useId, useState } from 'react'
import './RepoSearch.css'

const MAX_SUGGESTIONS = 8
const NO_OPTION = -1

function findMatches(options, value) {
  const query = value.trim().toLowerCase()
  if (!query) return []

  return options.filter(name => name.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS)
}

function nextIndex(current, step, count) {
  if (current === NO_OPTION) return step > 0 ? 0 : count - 1

  return (current + step + count) % count
}

export default function RepoSearch({ value, options, disabled, onChange }) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(NO_OPTION)
  const matches = findMatches(options, value)
  const showList = open && matches.length > 0
  const activeId = showList && active !== NO_OPTION ? `${listId}-${active}` : undefined

  function close() {
    setOpen(false)
    setActive(NO_OPTION)
  }

  function pick(name) {
    onChange(name)
    close()
  }

  function moveActive(step) {
    if (matches.length === 0) return

    setOpen(true)
    setActive(current => nextIndex(current, step, matches.length))
  }

  const keyActions = {
    ArrowDown: () => moveActive(1),
    ArrowUp: () => moveActive(-1),
    Escape: close,
    Enter: () => pick(matches[active]),
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !activeId) return

    const action = keyActions[event.key]
    if (!action) return

    event.preventDefault()
    action()
  }

  function handleChange(event) {
    onChange(event.target.value)
    setOpen(true)
    setActive(NO_OPTION)
  }

  function handleFocus() {
    setOpen(true)
  }

  function handleOptionMouseDown(event, name) {
    event.preventDefault()
    pick(name)
  }

  return (
    <div className="repo-search">
      <input
        className="input"
        type="search"
        role="combobox"
        aria-label="Repository to add"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeId}
        placeholder="Search or type org/repo"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={close}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul className="repo-search__list" id={listId} role="listbox" aria-label="Repositories">
          {matches.map((name, index) => (
            <li
              key={name}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`repo-search__option${index === active ? ' repo-search__option--active' : ''}`}
              onMouseDown={event => handleOptionMouseDown(event, name)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
