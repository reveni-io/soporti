import { useState } from 'react'
import { useAutoApproveRepos } from '../hooks/useAutoApproveRepos/useAutoApproveRepos.js'
import RepoOnModal from '../RepoOnModal/RepoOnModal.jsx'

const MODES = ['off', 'shadow', 'on']

function countPatterns(denylist) {
  const count = denylist.filter(pattern => pattern.trim()).length
  if (count === 0) return <span className="admin__muted">none</span>

  return `${count} pattern${count === 1 ? '' : 's'}`
}

function describeBehavior(repo) {
  if (repo.mode === 'off') return <span className="admin__muted">Not evaluated</span>
  if (!repo.jev) return <span className="badge">Decides as today (Jev off)</span>
  if (repo.mode === 'shadow') return <span className="badge">Logs but does not decide</span>

  return <span className="badge badge--success">Approves when every gate passes</span>
}

export default function AutoApproveRepos({ token, state, onLogout }) {
  const repos = useAutoApproveRepos(state, { token, onLogout })
  const [bulkMode, setBulkMode] = useState('shadow')
  const [newRepo, setNewRepo] = useState('')
  const count = repos.repos.length

  async function handleAdd(event) {
    event.preventDefault()
    if (await repos.addRepo(newRepo)) setNewRepo('')
  }

  return (
    <>
      <p className="admin__muted">
        The mode of each repo decides whether the reviewer approves its PRs. <code>off</code>: not evaluated.{' '}
        <code>shadow</code>: evaluated and logged, never approved. <code>on</code>: approved when no gate or question
        vetoes it.
      </p>
      <p className="admin__muted">
        Shadow first: a repo can be set to <code>on</code> only after it has been saved in <code>shadow</code>. Setting
        it to <code>on</code> then asks for confirmation with its shadow mode results. <code>off</code> and{' '}
        <code>shadow</code> apply without confirmation. Every change is saved with the project below.
      </p>
      <p className="admin__muted">
        Repos not in this list keep today’s behaviour: Soporti approves a PR when its review finds nothing blocking. A
        repo with Jev off also decides as today.
      </p>

      <ReposTable repos={repos} />

      <div className="admin__form admin__form--row">
        <span className="admin__muted">
          {repos.selected.length > 0
            ? `${repos.selected.length} of ${count} selected.`
            : 'Select repos, or all of them with the header checkbox, to change their mode at once.'}
        </span>
        <label className="admin__muted">
          Set mode to{' '}
          <select className="input" value={bulkMode} onChange={event => setBulkMode(event.target.value)}>
            {MODES.map(mode => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn--secondary"
          type="button"
          onClick={() => repos.requestMode(repos.selected, bulkMode)}
          disabled={repos.selected.length === 0}
        >
          Apply to {repos.selected.length || 'selected'} repo{repos.selected.length === 1 ? '' : 's'}
        </button>
      </div>
      {repos.message && <p className="alert alert--warning">{repos.message}</p>}
      <p className="note">Reviews in progress finish with the mode their repo had when they started.</p>

      {repos.addError && <p className="alert alert--error">{repos.addError}</p>}
      <form className="admin__form admin__form--row" onSubmit={handleAdd}>
        <input
          className="input"
          aria-label="Repository to add"
          placeholder="org/repo"
          autoComplete="off"
          value={newRepo}
          onChange={event => setNewRepo(event.target.value)}
          disabled={repos.adding}
        />
        <button className="btn btn--secondary" type="submit" disabled={repos.adding || !newRepo.trim()}>
          {repos.adding ? 'Checking...' : 'Add repo'}
        </button>
      </form>
      <p className="admin__muted">Soporti checks that the GitHub token can read the repo before adding it.</p>

      {repos.confirming && (
        <RepoOnModal
          token={token}
          names={repos.confirming}
          onConfirm={repos.confirmOn}
          onCancel={repos.cancelOn}
          onLogout={onLogout}
        />
      )}
    </>
  )
}

function ReposTable({ repos }) {
  const count = repos.repos.length
  if (count === 0) return <p className="admin__muted">No repo has auto-approve yet.</p>

  const allSelected = repos.selected.length === count

  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="Select all repos"
                checked={allSelected}
                onChange={event => repos.toggleAll(event.target.checked)}
              />
            </th>
            <th>Repository</th>
            <th>Mode</th>
            <th>Jev</th>
            <th>Own denylist</th>
            <th>Behavior</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {repos.repos.map(repo => (
            <tr key={repo.name}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${repo.name}`}
                  checked={repos.selected.includes(repo.name)}
                  onChange={event => repos.toggleSelected(repo.name, event.target.checked)}
                />
              </td>
              <td>
                <code>{repo.name}</code>
              </td>
              <td>
                <select
                  className="input"
                  aria-label={`Mode of ${repo.name}`}
                  value={repo.mode}
                  onChange={event => repos.requestMode([repo.name], event.target.value)}
                >
                  {MODES.map(mode => (
                    <option key={mode} value={mode} disabled={mode === 'on' && !repos.canGoOn(repo.name)}>
                      {mode === 'on' && !repos.canGoOn(repo.name) ? 'on (shadow first)' : mode}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Ask Jev about ${repo.name}`}
                  checked={repo.jev}
                  onChange={event => repos.updateRepo(repo.name, { jev: event.target.checked })}
                />
              </td>
              <td>{countPatterns(repo.denylist)}</td>
              <td>{describeBehavior(repo)}</td>
              <td>
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  aria-label={`Remove ${repo.name}`}
                  onClick={() => repos.removeRepo(repo.name)}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
