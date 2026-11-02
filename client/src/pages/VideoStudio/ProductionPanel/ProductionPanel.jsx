import { useState } from 'react'
import GenerationView from './GenerationView/GenerationView.jsx'
import ReadyView from './ReadyView/ReadyView.jsx'
import LivePreview from './LivePreview/LivePreview.jsx'
import { VERSION_STATUSES, estimateQueueMinutes } from '../version-state.js'
import './ProductionPanel.css'

const FAILURE_FALLBACKS = {
  [VERSION_STATUSES.FAILED]: 'This version failed.',
  [VERSION_STATUSES.CANCELLED]: 'This version was cancelled.',
}

const VIEWS = {
  [VERSION_STATUSES.QUEUED]: QueuedView,
  [VERSION_STATUSES.RUNNING]: GenerationView,
  [VERSION_STATUSES.READY]: ReadyView,
  [VERSION_STATUSES.FAILED]: FailedView,
  [VERSION_STATUSES.CANCELLED]: FailedView,
}

function viewFor(version) {
  if (version.status === VERSION_STATUSES.READY && !version.hasVideo) return StoredVersionView

  return VIEWS[version.status]
}

export default function ProductionPanel({ video, token, onLogout, busy, actions }) {
  const [selectedNumber, setSelectedNumber] = useState(null)
  const { versions } = video

  if (versions.length === 0) return <p className="production-panel__note">Preparing the first version…</p>

  const version = versions.find(candidate => candidate.version === selectedNumber) ?? versions[0]
  const View = viewFor(version)

  return (
    <div className="production-panel">
      {versions.length > 1 && (
        <VersionTabs versions={versions} selected={version.version} onSelect={setSelectedNumber} />
      )}

      <View
        key={version.version}
        video={video}
        version={version}
        token={token}
        onLogout={onLogout}
        busy={busy}
        actions={actions}
      />
    </div>
  )
}

function VersionTabs({ versions, selected, onSelect }) {
  const oldestFirst = [...versions].reverse()

  return (
    <div className="production-panel__tabs" role="tablist" aria-label="Versions">
      {oldestFirst.map(({ version }) => (
        <button
          key={version}
          type="button"
          role="tab"
          aria-selected={version === selected}
          className={`production-panel__tab${version === selected ? ' production-panel__tab--selected' : ''}`}
          onClick={() => onSelect(version)}
        >
          v{version}
        </button>
      ))}
    </div>
  )
}

function QueuedView({ video, busy, actions }) {
  return (
    <div className="production-panel__view">
      <p className="production-panel__lead">
        Another video is being generated. Yours starts in about {estimateQueueMinutes(video.queuePosition)} min.
      </p>
      <div>
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={actions.cancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function StoredVersionView({ video, version, token, onLogout, busy, actions }) {
  return (
    <div className="production-panel__view">
      <LivePreview
        token={token}
        videoId={video.id}
        version={version.version}
        format={video.brief.format}
        onLogout={onLogout}
      />
      <p className="production-panel__note">
        Only the two latest renders keep their MP4. This version still plays live, and rendering it again needs no new
        model call.
      </p>
      <div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => actions.render(version.version)}
        >
          Render this version
        </button>
      </div>
    </div>
  )
}

function FailedView({ version, busy, actions }) {
  return (
    <div className="production-panel__view">
      <p className="alert alert--error">{version.error ?? FAILURE_FALLBACKS[version.status]}</p>
      <div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => actions.retry(version.version)}
        >
          Retry
        </button>
      </div>
    </div>
  )
}
