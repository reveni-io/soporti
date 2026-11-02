import './VideoStatusBadge.css'

const STATUS_LABELS = {
  drafting: 'Drafting',
  storyboard: 'Storyboard',
  queued: 'Queued',
  running: 'Generating',
  ready: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const PHASE_LABELS = {
  preparing: 'Preparing',
  composing: 'Composing',
  music: 'Music',
  rendering: 'Rendering',
  finalizing: 'Finalizing',
}

const STATUS_MODIFIERS = {
  ready: 'badge--success',
  failed: 'video-status-badge--failed',
}

function describeStatus({ status, phase, progress }) {
  const parts = [STATUS_LABELS[status] ?? status, PHASE_LABELS[phase]]
  if (progress != null) parts.push(`${progress}%`)

  return parts.filter(Boolean).join(' · ')
}

export default function VideoStatusBadge({ status, phase, progress }) {
  const classes = ['badge', 'video-status-badge', STATUS_MODIFIERS[status]].filter(Boolean).join(' ')

  return <span className={classes}>{describeStatus({ status, phase, progress })}</span>
}
