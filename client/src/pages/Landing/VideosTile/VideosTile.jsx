import Icon from '../../../common/Icon/Icon.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import { staggerStyle } from '../stagger.js'
import './VideosTile.css'

const PHASES = ['Storyboard', 'Composing', 'Music', 'Rendering', 'Ready']
const READY_PHASE = PHASES.length - 1
const VIEW_THRESHOLD = 0.4

const SCENES = ['Emails that sound like you', 'Drafted from your own sent mail', 'Live for every merchant today']
const WAVEFORM = [
  0.35, 0.6, 0.9, 0.5, 0.75, 1, 0.65, 0.4, 0.8, 0.55, 0.95, 0.7, 0.45, 0.85, 0.6, 0.3, 0.7, 0.9, 0.5, 0.65,
]
const BRIEF = { format: '16:9', length: '30 s', pace: 'Upbeat' }
const ICON_SIZE = 12

const playRender = frameLoop([
  { frame: 1, ms: 1500 },
  { frame: 2, ms: 1500 },
  { frame: 3, ms: 2600 },
  { frame: READY_PHASE, ms: 4400 },
])

function phaseState(index, current) {
  if (index < current || current === READY_PHASE) return 'done'
  if (index === current) return 'current'

  return 'pending'
}

export default function VideosTile() {
  const { ref, frame: current } = usePlayOnView({
    play: playRender,
    initialFrame: 1,
    finalFrame: READY_PHASE,
    threshold: VIEW_THRESHOLD,
  })

  return (
    <div className="lp-videos-tile" ref={ref} aria-hidden="true">
      <div className="lp-videos-tile__player">
        <div className="lp-videos-tile__screen">
          {SCENES.map((scene, index) => (
            <span key={scene} className="lp-videos-tile__scene" style={staggerStyle(index)}>
              {scene}
            </span>
          ))}
          <span className="lp-videos-tile__brand">Soporti</span>
        </div>
        <div className="lp-videos-tile__wave">
          {WAVEFORM.map((height, index) => (
            <span key={index} style={{ '--h': height, ...staggerStyle(index) }} />
          ))}
        </div>
        <div className="lp-videos-tile__scrubber">
          <span className="lp-videos-tile__playhead" />
        </div>
      </div>

      <div className="lp-videos-tile__side">
        <div className="lp-videos-tile__brief">
          {Object.entries(BRIEF).map(([key, value]) => (
            <span key={key} className="chip chip--pill">
              {value}
            </span>
          ))}
        </div>
        <ol className="lp-videos-tile__phases">
          {PHASES.map((phase, index) => (
            <li key={phase} className={`lp-videos-tile__phase lp-videos-tile__phase--${phaseState(index, current)}`}>
              <span className="lp-videos-tile__marker" />
              {phase}
            </li>
          ))}
        </ol>
        {current === READY_PHASE ? (
          <span className="lp-videos-tile__file">
            <Icon name="download" size={ICON_SIZE} />
            MP4 · 1080p · 0:30
          </span>
        ) : (
          <span className="lp-videos-tile__progress">
            <span key={current} />
          </span>
        )}
      </div>
    </div>
  )
}
