import StoryboardPanel from '../StoryboardPanel/StoryboardPanel.jsx'
import ProductionPanel from '../ProductionPanel/ProductionPanel.jsx'
import { VIDEO_STAGES } from '../../../constants.js'
import './StudioPanel.css'

const SKELETON_ROWS = ['first', 'second', 'third']

export default function StudioPanel({ video, token, onLogout, busy, actions }) {
  const { stage, storyboard } = video

  if (stage === VIDEO_STAGES.PRODUCTION) {
    return (
      <ProductionPanel
        key={video.versions[0]?.version}
        video={video}
        token={token}
        onLogout={onLogout}
        busy={busy}
        actions={actions}
      />
    )
  }
  if (storyboard) {
    return (
      <StoryboardPanel
        storyboard={storyboard}
        canGenerate={stage === VIDEO_STAGES.STORYBOARD && !busy}
        onGenerate={actions.generate}
      />
    )
  }
  if (stage === VIDEO_STAGES.DRAFTING) return <DraftingSkeleton />

  return <p className="studio-panel__empty">No storyboard yet. Ask Soporti to draft it again from the conversation.</p>
}

function DraftingSkeleton() {
  return (
    <div className="studio-panel__skeleton" role="status">
      <p className="studio-panel__skeleton-text">Reading the repos and drafting scenes…</p>
      {SKELETON_ROWS.map(row => (
        <div key={row} className="card studio-panel__skeleton-row" />
      ))}
    </div>
  )
}
