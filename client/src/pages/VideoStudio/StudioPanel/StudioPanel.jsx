import StoryboardPanel from '../StoryboardPanel/StoryboardPanel.jsx'
import ProductionStatus from '../ProductionStatus/ProductionStatus.jsx'
import { VIDEO_STAGES } from '../../../constants.js'
import './StudioPanel.css'

const SKELETON_ROWS = ['first', 'second', 'third']

export default function StudioPanel({ video, busy, onGenerate }) {
  const { stage, storyboard } = video

  if (stage === VIDEO_STAGES.PRODUCTION) {
    return <ProductionStatus version={video.versions[0]} queuePosition={video.queuePosition} />
  }
  if (storyboard) {
    return (
      <StoryboardPanel
        storyboard={storyboard}
        canGenerate={stage === VIDEO_STAGES.STORYBOARD && !busy}
        onGenerate={onGenerate}
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
