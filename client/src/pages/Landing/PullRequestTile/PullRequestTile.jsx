import Icon from '../../../common/Icon/Icon.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './PullRequestTile.css'

const STAGE_ASKED = 0
const STAGE_READING = 1
const STAGE_EDITING = 2
const STAGE_OPENING = 3
const STAGE_OPENED = 4
const VIEW_THRESHOLD = 0.4

const REQUEST = 'On the checkout banner, say “store credit” instead of “refund”'
const STEPS = [
  { label: 'Reading file', detail: 'CheckoutBanner.jsx', stage: STAGE_READING },
  { label: 'Editing file', detail: 'CheckoutBanner.jsx', stage: STAGE_EDITING },
  { label: 'Opening pull request', stage: STAGE_OPENING },
]
const REPO = 'acme/storefront'
const PULL_REQUEST = { title: 'Say “store credit” on the checkout banner', badge: 'Draft · #312' }
const BRANCH = { head: 'soporti/store-credit-copy', base: 'main' }
const FILE = 'src/CheckoutBanner.jsx'
const DIFF = { before: 'label="Return it for ', removed: 'a refund', added: 'store credit', after: '"' }

const STEP_ICON_SIZE = 12
const PR_ICON_SIZE = 16

const playChange = frameLoop([
  { frame: STAGE_ASKED, ms: 1200 },
  { frame: STAGE_READING, ms: 1400 },
  { frame: STAGE_EDITING, ms: 1800 },
  { frame: STAGE_OPENING, ms: 1600 },
  { frame: STAGE_OPENED, ms: 5200 },
])

export default function PullRequestTile() {
  const { ref, frame: stage } = usePlayOnView({
    play: playChange,
    initialFrame: STAGE_ASKED,
    finalFrame: STAGE_OPENED,
    threshold: VIEW_THRESHOLD,
  })
  const visibleSteps = STEPS.filter(step => step.stage <= stage)
  const isEdited = stage >= STAGE_EDITING
  const isOpened = stage === STAGE_OPENED

  return (
    <div className="lp-pr-tile" ref={ref} aria-hidden="true">
      <div className="lp-pr-tile__chat">
        <p className="lp-pr-tile__request">{REQUEST}</p>
        <ol className="lp-pr-tile__steps">
          {visibleSteps.map(step => (
            <Step key={step.label} step={step} isDone={stage > step.stage} />
          ))}
        </ol>
      </div>

      <PreviewWindow className="lp-pr-tile__window" title={REPO} badge={isOpened ? PULL_REQUEST.badge : null}>
        <div className="lp-pr-tile__body">
          <Placeholder isReady={isOpened} shape="title">
            <Title />
          </Placeholder>
          <Placeholder isReady={isEdited} shape="branch">
            <Branch />
          </Placeholder>
          <Placeholder isReady={isEdited} shape="diff">
            <Diff />
          </Placeholder>
          <span className="lp-pr-tile__checks">
            {isOpened && (
              <span className="lp-pr-tile__ci">
                <span className="lp-spinner" />
                CI running
              </span>
            )}
          </span>
        </div>
      </PreviewWindow>
    </div>
  )
}

function Step({ step, isDone }) {
  return (
    <li className="lp-pr-tile__step">
      {isDone ? <Icon name="check" size={STEP_ICON_SIZE} /> : <span className="lp-spinner" />}
      {step.label}
      {step.detail && <span className="lp-pr-tile__detail">{step.detail}</span>}
    </li>
  )
}

function Placeholder({ isReady, shape, children }) {
  if (!isReady) return <span className={`lp-pr-tile__skeleton lp-pr-tile__skeleton--${shape}`} />

  return children
}

function Title() {
  return (
    <span className="lp-pr-tile__title">
      <Icon name="pull-request" size={PR_ICON_SIZE} />
      {PULL_REQUEST.title}
    </span>
  )
}

function Branch() {
  return (
    <span className="lp-pr-tile__branch">
      <code>{BRANCH.head}</code>
      <Icon name="arrow-right" size={STEP_ICON_SIZE} />
      <code>{BRANCH.base}</code>
    </span>
  )
}

function Diff() {
  return (
    <div className="lp-pr-tile__diff">
      <div className="lp-pr-tile__file">
        <span className="lp-pr-tile__path">{FILE}</span>
        <span className="lp-pr-tile__stat">
          <span className="lp-pr-tile__stat--added">+1</span>
          <span className="lp-pr-tile__stat--removed">−1</span>
        </span>
      </div>
      <code className="lp-pr-tile__line lp-pr-tile__line--removed">
        <span className="lp-pr-tile__sign">-</span>
        {DIFF.before}
        <mark className="lp-pr-tile__change">{DIFF.removed}</mark>
        {DIFF.after}
      </code>
      <code className="lp-pr-tile__line lp-pr-tile__line--added">
        <span className="lp-pr-tile__sign">+</span>
        {DIFF.before}
        <mark className="lp-pr-tile__change">{DIFF.added}</mark>
        {DIFF.after}
      </code>
    </div>
  )
}
