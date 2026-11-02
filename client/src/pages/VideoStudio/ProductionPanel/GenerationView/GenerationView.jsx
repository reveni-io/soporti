import ProgressBar from '../../../../common/ProgressBar/ProgressBar.jsx'
import PhaseStepper from '../PhaseStepper/PhaseStepper.jsx'
import ContactSheets from '../ContactSheets/ContactSheets.jsx'
import LivePreview from '../LivePreview/LivePreview.jsx'
import { describeEta } from '../../version-state.js'
import './GenerationView.css'

const CLOCK_OPTIONS = { hour: '2-digit', minute: '2-digit' }

export default function GenerationView({ video, version, isLatest, token, onLogout, busy, actions }) {
  return (
    <div className="generation-view">
      <PhaseStepper phase={version.phase} />
      {version.step && <p className="generation-view__step">{version.step}</p>}
      <div className="generation-view__follow">
        <p className="note generation-view__note">
          You can close this page: Soporti messages you on Slack when it is ready.
        </p>
        {isLatest && (
          <button type="button" className="btn btn--secondary" disabled={busy} onClick={actions.cancel}>
            Cancel
          </button>
        )}
      </div>

      {version.previewReady ? (
        <RenderStage video={video} version={version} token={token} onLogout={onLogout} />
      ) : (
        <ReviewStage video={video} version={version} token={token} onLogout={onLogout} />
      )}
    </div>
  )
}

function RenderStage({ video, version, token, onLogout }) {
  const progress = version.progress ?? 0
  const eta = describeEta(version.etaSeconds)

  return (
    <>
      <LivePreview
        token={token}
        videoId={video.id}
        version={version.version}
        format={video.brief.format}
        onLogout={onLogout}
      />
      <div className="generation-view__render">
        <ProgressBar value={progress} label="Render progress" />
        <p className="generation-view__eta">{[`Rendering the MP4 · ${progress}%`, eta].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="generation-view__actions">
        <button type="button" className="btn btn--primary" disabled title="Available once the MP4 is rendered">
          Download MP4
        </button>
      </div>
    </>
  )
}

function ReviewStage({ video, version, token, onLogout }) {
  return (
    <>
      <ContactSheets videoId={video.id} frames={version.frames} token={token} onLogout={onLogout} />
      <EventLog events={version.events} />
    </>
  )
}

function EventLog({ events }) {
  if (events.length === 0) return null

  return (
    <ol className="generation-view__events" aria-label="Notes">
      {events.map(event => (
        <li key={`${event.at}-${event.text}`} className="generation-view__event">
          <time className="generation-view__event-time" dateTime={event.at}>
            {new Date(event.at).toLocaleTimeString([], CLOCK_OPTIONS)}
          </time>
          <span>{event.text}</span>
        </li>
      ))}
    </ol>
  )
}
