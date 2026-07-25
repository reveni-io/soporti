import { useEffect, useRef } from 'react'
import { useScenarioPlayer } from '../hooks/useScenarioPlayer/useScenarioPlayer.js'
import { SCENARIOS } from './scenarios.js'
import './HeroChat.css'

export default function HeroChat() {
  const messages = useScenarioPlayer(SCENARIOS)
  const scrollRef = useRef(null)

  useEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages])

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
          {messages.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}
        </div>
      </div>
    </div>
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
    <div className={`tool-call ${tool.done ? 'tool-call--done' : 'tool-call--running'}`}>
      <span className="tool-call__status-icon">{tool.done ? '✓' : ''}</span>
      <span className="tool-call__emoji">{tool.emoji}</span>
      <span className="tool-call__label">{tool.label}</span>
      <span className="tool-call__detail">{tool.detail}</span>
      {tool.done && tool.duration && <span className="tool-call__duration">{tool.duration}</span>}
    </div>
  )
}
