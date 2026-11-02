import { useState } from 'react'
import './RepoPicker.css'

const MAX_REPOS = 5

function matchesRepo(repo, query) {
  return [repo.fullName, repo.description, repo.language].some(value => value?.toLowerCase().includes(query))
}

export default function RepoPicker({ repos, loading, error, selected, onToggle }) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const visibleRepos = query ? repos.filter(repo => matchesRepo(repo, query)) : repos

  return (
    <fieldset className="repo-picker">
      <legend className="repo-picker__legend">
        Repos{' '}
        <span className="repo-picker__count">
          {selected.length}/{MAX_REPOS}
        </span>
      </legend>

      {selected.length > 0 && (
        <ul className="repo-picker__selected">
          {selected.map(fullName => (
            <li key={fullName} className="chip chip--pill">
              {fullName}
              <button
                type="button"
                className="repo-picker__remove"
                aria-label={`Remove ${fullName}`}
                onClick={() => onToggle(fullName)}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="search"
        className="input repo-picker__search"
        placeholder="Search repos..."
        aria-label="Search repos"
        value={search}
        onChange={event => setSearch(event.target.value)}
      />

      <RepoOptions repos={visibleRepos} loading={loading} error={error} selected={selected} onToggle={onToggle} />
    </fieldset>
  )
}

function RepoOptions({ repos, loading, error, selected, onToggle }) {
  const isFull = selected.length >= MAX_REPOS

  if (loading) return <p className="repo-picker__status">Loading repos...</p>
  if (error) return <p className="alert alert--error">{error}</p>
  if (repos.length === 0) return <p className="repo-picker__status">No repos match.</p>

  return (
    <ul className="repo-picker__list">
      {repos.map(repo => {
        const isSelected = selected.includes(repo.fullName)
        return (
          <li key={repo.fullName}>
            <label className="repo-picker__option">
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isFull && !isSelected}
                onChange={() => onToggle(repo.fullName)}
              />
              <span className="repo-picker__name">{repo.fullName}</span>
              {repo.language && <span className="repo-picker__language">{repo.language}</span>}
            </label>
          </li>
        )
      })}
    </ul>
  )
}
