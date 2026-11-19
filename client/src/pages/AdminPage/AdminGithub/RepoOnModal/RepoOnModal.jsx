import { useCallback } from 'react'
import { getGithubShadowStats } from '../../../../services/services.js'
import { useAuthedConfig } from '../../../../hooks/useAuthedConfig/useAuthedConfig.js'
import { useOverlayDismiss } from '../../../../hooks/useOverlayDismiss/useOverlayDismiss.js'

function describeShare(stats) {
  if (stats.evaluated === 0) return <span className="admin__muted">none</span>

  return `${stats.wouldApprove} (${Math.round((stats.wouldApprove / stats.evaluated) * 100)}%)`
}

export default function RepoOnModal({ token, names, onConfirm, onCancel, onLogout }) {
  const fetchStats = useCallback(authToken => getGithubShadowStats(authToken, names), [names])
  const { config: stats, error } = useAuthedConfig(fetchStats, token, onLogout)
  const overlayProps = useOverlayDismiss(onCancel)
  const one = names.length === 1
  const withoutData = (stats?.repos ?? []).filter(repo => repo.evaluated === 0).map(repo => repo.repo)

  return (
    <div className="modal-overlay" {...overlayProps}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="repo-on-title">
        <div className="modal__header">
          <h3 className="modal__title" id="repo-on-title">
            Set {one ? names[0] : `${names.length} repos`} to on?
          </h3>
          <button className="modal__close" type="button" onClick={onCancel} aria-label="Close">
            &times;
          </button>
        </div>

        <p className="admin__muted">
          The reviewer will approve PRs in {one ? 'this repo' : 'these repos'} when no gate or question vetoes them.
          Shadow mode results so far:
        </p>
        <ShadowStatsTable stats={stats} error={error} />
        {withoutData.length > 0 && (
          <p className="alert alert--warning">
            No PR evaluated in shadow mode yet for {withoutData.join(', ')}. Wait for shadow results before turning{' '}
            {withoutData.length === 1 ? 'it' : 'them'} on.
          </p>
        )}

        <div className="modal__actions">
          <button className="btn btn--secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--primary" type="button" onClick={onConfirm}>
            Set to on
          </button>
        </div>
      </div>
    </div>
  )
}

function ShadowStatsTable({ stats, error }) {
  if (error) return <p className="alert alert--error">{error}</p>
  if (!stats) return <p className="admin__muted">Loading...</p>

  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>Repository</th>
            <th>PRs evaluated</th>
            <th>Would approve</th>
            <th>Days of data</th>
          </tr>
        </thead>
        <tbody>
          {stats.repos.map(repo => (
            <tr key={repo.repo}>
              <td>
                <code>{repo.repo}</code>
              </td>
              <td>{repo.evaluated}</td>
              <td>{describeShare(repo)}</td>
              <td>{repo.days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
