import Section from '../Section/Section.jsx'
import PointList from '../PointList/PointList.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import './VideosSection.css'

const POINTS = [
  'Write a brief: the idea, the repos, the audience, the language, the format (16:9, 1:1 or 9:16), the length and the pace',
  'Approve a storyboard first: scenes, on-screen text, sound and a music direction, revised in a conversation until it fits',
  'Generation runs in the background: follow the phase, the frames the agent reviewed and its notes, or close the page and get a Slack message when it is ready',
  'Music and sound effects are synthesized from code in sync with the scenes: no sample library, no licences',
  'Watch the live preview while the MP4 renders, then download it, share a link or ask for a change as a new version',
  'Create a variant, say one branded for a merchant, from the same brief and storyboard',
]

const STEPS = [
  { label: 'Preparing', state: 'done' },
  { label: 'Composing', state: 'done' },
  { label: 'Music', state: 'done' },
  { label: 'Rendering', state: 'current' },
  { label: 'Ready', state: 'pending' },
]

const VERSIONS = [
  { label: 'v1', isSelected: false },
  { label: 'v2', isSelected: true },
]

export default function VideosSection() {
  return (
    <Section id="videos" className="lp-section--cool">
      <div className="lp-split">
        <div>
          <span className="lp-eyebrow">Videos</span>
          <h2 className="lp-h2">From a brief to a product video, with its own soundtrack.</h2>
          <p className="lp-lead">
            Soporti already knows your code, so it can explain it on screen. Describe the feature, the launch or the
            merchant it is for: an agent reads the repos, proposes a storyboard and, once you approve it, writes the
            video, watches its own frames to fix what is off and renders an MP4 with music.
          </p>
          <PointList points={POINTS} />
        </div>

        <div className="lp-split__visual">
          <PreviewWindow className="lp-videos" badge="Videos">
            <div className="lp-videos__body">
              <div className="lp-videos__tabs">
                {VERSIONS.map(version => (
                  <span
                    key={version.label}
                    className={`lp-videos__tab${version.isSelected ? ' lp-videos__tab--selected' : ''}`}
                  >
                    {version.label}
                  </span>
                ))}
              </div>

              <div className="lp-videos__screen">
                <span className="lp-videos__caption">Emails that sound like you</span>
              </div>

              <ol className="lp-videos__steps" aria-label="Generation steps">
                {STEPS.map(step => (
                  <li key={step.label} className={`lp-videos__step lp-videos__step--${step.state}`}>
                    {step.label}
                  </li>
                ))}
              </ol>

              <div className="lp-videos__render">
                <span className="lp-videos__bar" />
              </div>
              <p className="lp-videos__eta">Rendering the MP4 · 64% · About 2 min left</p>
            </div>
          </PreviewWindow>
        </div>
      </div>
    </Section>
  )
}
