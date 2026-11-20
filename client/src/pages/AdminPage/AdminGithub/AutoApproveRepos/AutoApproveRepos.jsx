import { useState } from 'react'
import { AUTO_APPROVE_MODES, AUTO_APPROVE_OFF, AUTO_APPROVE_ON, AUTO_APPROVE_SHADOW } from '../../../../constants.js'
import { useAutoApproveRepos } from '../hooks/useAutoApproveRepos/useAutoApproveRepos.js'
import RepoOnModal from '../RepoOnModal/RepoOnModal.jsx'
import RepoSearch from '../RepoSearch/RepoSearch.jsx'

function countPatterns(denylist) {
  const count = denylist.filter(pattern => pattern.trim()).length
  if (count === 0) return <span className="admin__muted">none</span>

  return `${count} pattern${count === 1 ? '' : 's'}`
}

function describeBehavior(repo) {
  if (repo.mode === AUTO_APPROVE_OFF) return <span className="admin__muted">Not evaluated</span>
  if (!repo.jev) return <span className="badge">Decides as today (Jev off)</span>
  if (repo.mode === AUTO_APPROVE_SHADOW) return <span className="badge">Logs but does not decide</span>

  return <span className="badge badge--success">Approves when every gate passes</span>
}

export default function AutoApproveRepos({ token, state, keyConfigured = false, readableRepos = [], onLogout }) {
  const repos = useAutoApproveRepos(state, { token, onLogout, keyConfigured })
  const [bulkMode, setBulkMode] = useState(AUTO_APPROVE_SHADOW)
  const [newRepo, setNewRepo] = useState('')
  const count = repos.repos.length
  const added = new Set(repos.repos.map(repo => repo.name.toLowerCase()))
  const repoOptions = readableRepos.map(repo => repo.fullName).filter(name => !added.has(name.toLowerCase()))

  async function handleAdd(event) {
    event.preventDefault()
    if (await repos.addRepo(newRepo)) setNewRepo('')
  }

  function handleBulkModeChange(event) {
    setBulkMode(event.target.value)
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

      <ReposTable repos={repos} keyConfigured={keyConfigured} />
      {!keyConfigured && (
        <p className="admin__muted">Save the Jev API key in Admin → Guards before asking Jev about a repo.</p>
      )}

      <div className="admin__form admin__form--row">
        <span className="admin__muted">
          {repos.selected.length > 0
            ? `${repos.selected.length} of ${count} selected.`
            : 'Select repos, or all of them with the header checkbox, to change their mode at once.'}
        </span>
        <label className="admin__muted">
          Set mode to{' '}
          <select
            className="input input--select admin__select--compact"
            value={bulkMode}
            onChange={handleBulkModeChange}
          >
            {AUTO_APPROVE_MODES.map(mode => (
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
        <RepoSearch value={newRepo} options={repoOptions} disabled={repos.adding} onChange={setNewRepo} />
        <button className="btn btn--secondary" type="submit" disabled={repos.adding || !newRepo.trim()}>
          {repos.adding ? 'Checking...' : 'Add repo'}
        </button>
      </form>
      <p className="admin__muted">
        Type to search the repos the GitHub token can read, or write the full name. Soporti checks that the token can
        read it before adding it.
      </p>

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

function ReposTable({ repos, keyConfigured }) {
  const count = repos.repos.length
  if (count === 0) return <p className="admin__muted">No repo has auto-approve yet.</p>

  const allSelected = repos.selected.length === count

  function handleSelectAll(event) {
    repos.toggleAll(event.target.checked)
  }

  function handleSelect(name, event) {
    repos.toggleSelected(name, event.target.checked)
  }

  function handleModeChange(name, event) {
    repos.requestMode([name], event.target.value)
  }

  function handleJevChange(name, event) {
    repos.updateRepo(name, { jev: event.target.checked })
  }

  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>
              <input type="checkbox" aria-label="Select all repos" checked={allSelected} onChange={handleSelectAll} />
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
                  onChange={event => handleSelect(repo.name, event)}
                />
              </td>
              <td>
                <code>{repo.name}</code>
              </td>
              <td>
                <select
                  className="input input--select admin__select--compact"
                  aria-label={`Mode of ${repo.name}`}
                  value={repo.mode}
                  onChange={event => handleModeChange(repo.name, event)}
                >
                  {AUTO_APPROVE_MODES.map(mode => (
                    <option key={mode} value={mode} disabled={mode === AUTO_APPROVE_ON && !repos.canGoOn(repo.name)}>
                      {mode}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Ask Jev about ${repo.name}`}
                  checked={repo.jev}
                  onChange={event => handleJevChange(repo.name, event)}
                  disabled={!keyConfigured && !repo.jev}
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
