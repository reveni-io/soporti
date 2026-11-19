import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import { MCP_COMMAND } from '../constants.js'
import './McpTerminal.css'

const LINES = [
  { kind: 'command', text: MCP_COMMAND },
  { kind: 'success', text: '✓ Added HTTP MCP server soporti' },
  { kind: 'muted', text: 'Opened the browser to sign in · connected as you', pauseMs: 900 },
  { kind: 'prompt', text: 'Why do refunds fail for merchant 812?' },
  { kind: 'tool', text: 'soporti · ask_soporti' },
  { kind: 'progress', text: 'Searching logs · refund failed' },
  { kind: 'progress', text: 'Reading src/refunds/service.js' },
  { kind: 'progress', text: 'Querying production · read-only' },
  {
    kind: 'answer',
    text: 'Since the 09:10 deploy, partial returns reach the payment provider without a currency, so it rejects them. 4 sources.',
  },
]
const TYPED_KINDS = new Set(['command', 'prompt'])
const LINE_MARKERS = { command: '$', prompt: '›', tool: '⏺', progress: '⎿', answer: '⏺' }
const EMPTY_FRAME = { shown: 0, typed: 0 }
const FINAL_FRAME = { shown: LINES.length, typed: 0 }
const START_MS = 700
const TYPE_MS = 28
const TYPE_CHUNK = 2
const LINE_MS = 650
const HOLD_MS = 5200
const VIEW_THRESHOLD = 0.35

async function typeLine({ index, text }, { show, sleep, isCancelled }) {
  for (let typed = TYPE_CHUNK; typed < text.length; typed += TYPE_CHUNK) {
    if (isCancelled()) return
    show({ shown: index, typed })
    await sleep(TYPE_MS)
  }
}

async function playSession(controls) {
  const { show, sleep, isCancelled } = controls

  while (!isCancelled()) {
    show(EMPTY_FRAME)
    await sleep(START_MS)
    for (const [index, line] of LINES.entries()) {
      if (isCancelled()) return
      if (TYPED_KINDS.has(line.kind)) await typeLine({ index, text: line.text }, controls)
      show({ shown: index + 1, typed: 0 })
      await sleep(line.pauseMs ?? LINE_MS)
    }
    await sleep(HOLD_MS)
  }
}

export default function McpTerminal() {
  const { ref, frame } = usePlayOnView({
    play: playSession,
    initialFrame: EMPTY_FRAME,
    finalFrame: FINAL_FRAME,
    threshold: VIEW_THRESHOLD,
  })
  const typing = frame.typed > 0 ? LINES[frame.shown] : null

  return (
    <div className="lp-terminal" ref={ref} aria-hidden="true">
      <PreviewWindow className="lp-terminal__window" title="returns-api — claude" badge="MCP" isDark>
        <div className="lp-terminal__screen">
          {LINES.slice(0, frame.shown).map(line => (
            <TerminalLine key={line.text} line={line} />
          ))}
          {typing && <TerminalLine line={{ ...typing, text: typing.text.slice(0, frame.typed) }} hasCaret />}
          {!typing && frame.shown === LINES.length && <TerminalLine line={{ kind: 'prompt', text: '' }} hasCaret />}
        </div>
      </PreviewWindow>
    </div>
  )
}

function TerminalLine({ line, hasCaret = false }) {
  const marker = LINE_MARKERS[line.kind]

  return (
    <p className={`lp-terminal__line lp-terminal__line--${line.kind}`}>
      {marker && <span className="lp-terminal__marker">{marker}</span>}
      <span className="lp-terminal__text">
        {line.text}
        {hasCaret && <span className="lp-terminal__caret" />}
      </span>
    </p>
  )
}
