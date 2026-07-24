import { useEffect, useRef, useState } from 'react'
import './HeroChat.css'

// A looping, fake-but-faithful chat that plays in the hero. It reuses the real
// chat's DOM/classes (.message, .tool-call, .message__typing) so it looks
// exactly like the product: a question comes in, Soporti "searches" a source
// (spinner → ✓ with a duration), then streams an answer token by token.

const SCENARIOS = [
  {
    question: 'How many returns did Acme get in the last 7 days?',
    tools: [{ emoji: '🗄️', label: 'Querying database', detail: 'returns · merchant Acme', duration: '1.2s' }],
    answer: [
      { t: 'Acme had ' },
      { t: '1,284 returns', b: true },
      { t: ' in the last 7 days, ' },
      { t: 'up 12%', b: true },
      { t: ' from the week before. Top reason: ' },
      { t: 'wrong size', b: true },
      { t: ' (38%).' },
    ],
  },
  {
    question: 'Look up order #1024 in Shopify for Acme',
    tools: [
      { emoji: '🛍️', label: 'Searching Shopify', detail: 'order #1024', duration: '0.8s' },
      { emoji: '🗄️', label: 'Querying database', detail: 'return status', duration: '0.6s' },
    ],
    answer: [
      { t: 'Order ' },
      { t: '#1024', b: true },
      { t: ' is ' },
      { t: 'fulfilled', b: true },
      { t: ' and has an open return in ' },
      { t: '“label printed”', b: true },
      { t: ' status. The ' },
      { t: '€42.50', b: true },
      { t: ' refund is issued once it’s received.' },
    ],
  },
  {
    question: 'Why isn’t the exchange label emailed to the customer?',
    tools: [
      { emoji: '🔍', label: 'Searching code', detail: '"shipping label" · returns-api', duration: '1.4s' },
      { emoji: '📄', label: 'Reading file', detail: 'labels/service.rb', duration: '0.5s' },
    ],
    answer: [
      { t: 'The label is only emailed when ' },
      { t: 'auto_send_label', b: true },
      { t: ' is on. For ' },
      { t: 'manual', b: true },
      { t: ' exchanges it’s attached to the returns page instead, so no email goes out.' },
    ],
  },
]

function ToolPill({ tool }) {
  return (
    <div className={`tool-call ${tool.done ? 'tool-call--done' : 'tool-call--running'}`}>
      <span className="tool-call__status-icon">{tool.done ? '✓' : ''}</span>
      <span className="tool-call__emoji">{tool.emoji}</span>
      <span className="tool-call__label">{tool.label}</span>
      <span className="tool-call__detail">{tool.detail}</span>
      {tool.done && tool.duration && <span className="tool-call__duration">{tool.duration}</span>}
    </div>
  )
}

function ChatMessage({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className="message message--user">
        <div className="message__bubble message__bubble--user">{msg.text}</div>
      </div>
    )
  }

  return (
    <div className="message message--assistant">
      <div className="message__bubble message__bubble--assistant">
        {msg.tools.map((tool, i) => (
          <ToolPill key={i} tool={tool} />
        ))}
        {msg.phase === 'thinking' && (
          <div className="message__typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {msg.answer.length > 0 && (
          <p className="hero-chat__text">
            {msg.answer.map((tok, i) => (tok.b ? <strong key={i}>{tok.t}</strong> : <span key={i}>{tok.t}</span>))}
          </p>
        )}
      </div>
    </div>
  )
}

export default function HeroChat() {
  const [messages, setMessages] = useState([])
  const scrollRef = useRef(null)

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    // Respect reduced motion: show one finished exchange, statically.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      const sc = SCENARIOS[0]
      setMessages([
        { role: 'user', text: sc.question },
        { role: 'assistant', phase: 'answer', tools: sc.tools.map(t => ({ ...t, done: true })), answer: sc.answer },
      ])
      return
    }

    let cancelled = false
    const timers = []
    const sleep = ms => new Promise(res => timers.push(setTimeout(res, ms)))

    const setSafe = value => {
      if (!cancelled) setMessages(value)
    }
    const patchAssistant = patch =>
      setSafe(prev => {
        const next = prev.slice()
        next[next.length - 1] = { ...next[next.length - 1], ...patch }
        return next
      })

    async function playScenario(sc) {
      setSafe([{ role: 'user', text: sc.question }])
      await sleep(1000)
      if (cancelled) return

      setSafe(prev => [...prev, { role: 'assistant', phase: 'thinking', tools: [], answer: [] }])
      await sleep(1200)
      if (cancelled) return

      const tools = []
      for (const tool of sc.tools) {
        tools.push({ ...tool, done: false })
        patchAssistant({ phase: 'tools', tools: tools.map(t => ({ ...t })) })
        await sleep(1250)
        if (cancelled) return
        tools[tools.length - 1].done = true
        patchAssistant({ phase: 'tools', tools: tools.map(t => ({ ...t })) })
        await sleep(450)
        if (cancelled) return
      }

      const revealed = []
      for (const tok of sc.answer) {
        revealed.push(tok)
        patchAssistant({ phase: 'answer', answer: revealed.slice() })
        await sleep(170)
        if (cancelled) return
      }
      await sleep(4500)
    }

    async function loop() {
      let i = 0
      while (!cancelled) {
        setSafe([])
        await sleep(500)
        if (cancelled) return
        await playScenario(SCENARIOS[i % SCENARIOS.length])
        i++
      }
    }

    loop()

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <div className="hero-chat" aria-hidden="true">
      <div className="hero-chat__window">
        <div className="hero-chat__bar">
          <span className="hero-chat__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="hero-chat__bar-title">Soporti</span>
          <span className="hero-chat__badge">YOLO</span>
        </div>
        <div className="hero-chat__scroll" ref={scrollRef}>
          {messages.map((msg, i) => (
            <ChatMessage key={i} msg={msg} />
          ))}
        </div>
      </div>
    </div>
  )
}
