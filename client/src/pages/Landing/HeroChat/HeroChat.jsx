import { useEffect, useRef } from 'react'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { staggerStyle } from '../stagger.js'
import { HERO_SOURCES } from './scenarios.js'
import './HeroChat.css'

const TOOL_ICON_SIZE = 14
const SOURCE_ICON_SIZE = 18

function sourceStates(messages) {
  const assistant = messages.findLast(message => message.role === 'assistant')
  const states = new Map()

  assistant?.tools.forEach(tool => {
    const isRunning = !tool.done || states.get(tool.source) === 'running'
    states.set(tool.source, isRunning ? 'running' : 'done')
  })

  return states
}

export default function HeroChat({ messages }) {
  const scrollRef = useRef(null)
  const states = sourceStates(messages)

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages])

  return (
    <div className="hero-chat" aria-hidden="true">
      <div className="hero-chat__halo" />
      {HERO_SOURCES.map((source, index) => (
        <SourceChip key={source.id} source={source} index={index} state={states.get(source.id)} />
      ))}
      <div className="hero-chat__stage">
        <PreviewWindow className="hero-chat__window" badge="YOLO">
          <div className="hero-chat__scroll" ref={scrollRef}>
            {messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
          </div>
          <div className="hero-chat__composer">
            <span className="hero-chat__placeholder">Ask Soporti anything…</span>
            <span className="lp-send">↑</span>
          </div>
        </PreviewWindow>
      </div>
    </div>
  )
}

function SourceChip({ source, index, state }) {
  const modifier = state ? ` hero-chat__source--${state}` : ''

  return (
    <span
      className={`hero-chat__source hero-chat__source--${source.side}${modifier}`}
      style={staggerStyle(index)}
      data-slot={source.slot}
      data-source={source.id}
      data-state={state ?? 'idle'}
    >
      <IntegrationIcon id={source.id} size={SOURCE_ICON_SIZE} />
      {source.label}
    </span>
  )
}

function ChatMessage({ message }) {
  if (message.role === 'user') {
    return (
      <div className="message message--user">
        <div className="message__bubble message__bubble--user">{message.text}</div>
      </div>
    )
  }

  return (
    <div className="message message--assistant">
      <div className="message__bubble message__bubble--assistant">
        {message.tools.map((tool, index) => (
          <ToolPill key={index} tool={tool} />
        ))}
        {message.phase === 'thinking' && (
          <div className="message__typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {message.answer.length > 0 && (
          <p className="hero-chat__text">
            {message.answer.map((token, index) =>
              token.b ? <strong key={index}>{token.t}</strong> : <span key={index}>{token.t}</span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

function ToolPill({ tool }) {
  return (
    <div className={`hero-chat__tool ${tool.done ? 'hero-chat__tool--done' : 'hero-chat__tool--running'}`}>
      <span className="hero-chat__tool-status">{tool.done ? '✓' : <span className="lp-spinner" />}</span>
      <span className="hero-chat__tool-icon">
        <IntegrationIcon id={tool.source} size={TOOL_ICON_SIZE} />
      </span>
      <span className="hero-chat__tool-label">{tool.label}</span>
      <span className="hero-chat__tool-detail">{tool.detail}</span>
      {tool.done && <span className="hero-chat__tool-duration">{tool.duration}</span>}
    </div>
  )
}
