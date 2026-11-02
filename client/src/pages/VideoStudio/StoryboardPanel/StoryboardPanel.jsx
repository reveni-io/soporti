import { formatTimecode } from '../format-timecode.js'
import './StoryboardPanel.css'

function describeMusic({ style, bpm, mood }) {
  return `${style} · ${bpm} bpm · ${mood}`
}

export default function StoryboardPanel({ storyboard, canGenerate, onGenerate }) {
  return (
    <div className="storyboard-panel">
      <div className="storyboard-panel__intro">
        <h2 className="storyboard-panel__title">{storyboard.title}</h2>
        {storyboard.summary && <p className="storyboard-panel__summary">{storyboard.summary}</p>}
      </div>

      <ol className="storyboard-panel__scenes">
        {storyboard.scenes.map((scene, index) => (
          <SceneCard key={`${scene.start}-${index}`} scene={scene} number={index + 1} />
        ))}
      </ol>

      <dl className="storyboard-panel__summary-list">
        <Detail label="Music" value={describeMusic(storyboard.music)} />
        <Detail label="Total" value={formatTimecode(storyboard.durationSeconds)} />
      </dl>

      <button type="button" className="btn btn--primary btn--block" disabled={!canGenerate} onClick={onGenerate}>
        Generate video
      </button>
    </div>
  )
}

function SceneCard({ scene, number }) {
  return (
    <li className="card storyboard-panel__scene">
      <div className="storyboard-panel__scene-header">
        <span className="storyboard-panel__scene-number">{number}</span>
        <span className="storyboard-panel__scene-time">
          {formatTimecode(scene.start)}–{formatTimecode(scene.end)}
        </span>
        <h3 className="storyboard-panel__scene-title">{scene.title}</h3>
      </div>

      <dl className="storyboard-panel__scene-details">
        <Detail label="Shown" value={scene.visual} />
        <Detail label="On screen" value={scene.onScreenText} />
        <Detail label="Sound" value={scene.sound} />
      </dl>
    </li>
  )
}

function Detail({ label, value }) {
  return (
    <div className="storyboard-panel__detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
