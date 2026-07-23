import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import MermaidDiagram from './MermaidDiagram.jsx'
import ChartBlock from './ChartBlock.jsx'
import CsvBlock from './CsvBlock.jsx'
import ToolCall from './ToolCall.jsx'
import FeedbackButtons from './FeedbackButtons.jsx'
import './Message.css'

const MERMAID_START =
  /^(flowchart|graph|erDiagram|sequenceDiagram|classDiagram|stateDiagram|pie|gantt|journey|gitGraph|mindmap|timeline|quadrantChart|xychart|block-beta|architecture)\b/

function wrapMermaidBlocks(text) {
  const lines = text.split('\n')
  const result = []
  let inFence = false
  let mermaidBuf = null

  function flushMermaid() {
    if (mermaidBuf && mermaidBuf.length > 1) {
      result.push('```mermaid', ...mermaidBuf, '```', '')
    } else if (mermaidBuf) {
      result.push(...mermaidBuf)
    }
    mermaidBuf = null
  }

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      flushMermaid()
      inFence = !inFence
      result.push(line)
      continue
    }

    if (inFence) {
      result.push(line)
      continue
    }

    if (!mermaidBuf && MERMAID_START.test(line.trim())) {
      mermaidBuf = [line]
      continue
    }

    if (mermaidBuf) {
      if (/^\s/.test(line) || line.trim() === '' || /^(subgraph|end|style|classDef|linkStyle)\b/.test(line.trim())) {
        mermaidBuf.push(line)
        continue
      }
      flushMermaid()
    }

    result.push(line)
  }

  flushMermaid()
  return result.join('\n')
}

function CodeCopyButton({ code }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function handleCopy() {
    if (!navigator.clipboard) return
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      type="button"
      className="code-block__copy"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy code'}
    >
      {copied ? (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  )
}

function CodeBlock({ children, className, isStreaming, token }) {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const code = String(children).replace(/\n$/, '')

  if (language === 'mermaid') {
    if (isStreaming) {
      return (
        <div className="mermaid-diagram mermaid-diagram--pending">
          <div className="mermaid-skeleton">
            <div className="mermaid-skeleton__node mermaid-skeleton__node--top" />
            <div className="mermaid-skeleton__connector" />
            <div className="mermaid-skeleton__row">
              <div className="mermaid-skeleton__node" />
              <div className="mermaid-skeleton__node" />
            </div>
            <div className="mermaid-skeleton__connector" />
            <div className="mermaid-skeleton__node mermaid-skeleton__node--bottom" />
          </div>
        </div>
      )
    }
    return <MermaidDiagram chart={code} token={token} />
  }

  if (language === 'chart') {
    if (isStreaming) {
      return (
        <div className="chart-block chart-block--pending">
          <div className="chart-skeleton">
            <div className="chart-skeleton__title" />
            <div className="chart-skeleton__area">
              <div className="chart-skeleton__bar" style={{ height: '60%' }} />
              <div className="chart-skeleton__bar" style={{ height: '85%' }} />
              <div className="chart-skeleton__bar" style={{ height: '45%' }} />
              <div className="chart-skeleton__bar" style={{ height: '70%' }} />
              <div className="chart-skeleton__bar" style={{ height: '55%' }} />
            </div>
          </div>
        </div>
      )
    }
    return <ChartBlock data={code} />
  }

  if (language === 'csv') {
    return <CsvBlock csv={code} canDownload={!isStreaming} />
  }

  if (!match) {
    return <code className="inline-code">{children}</code>
  }

  return (
    <div className="code-block">
      <div className="code-block__header">
        <span className="code-block__lang">{language}</span>
        {!isStreaming && <CodeCopyButton code={code} />}
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '13px', background: '#042503' }}
        codeTagProps={{ style: { background: 'transparent' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

export default function Message({ message, isStreaming, token }) {
  if (message.role === 'user') {
    return (
      <div className="message message--user">
        <div className="message__bubble message__bubble--user">{message.content}</div>
      </div>
    )
  }

  return (
    <div className="message message--assistant">
      <div className="message__bubble message__bubble--assistant">
        {message.parts.map((part, i) => {
          switch (part.type) {
            case 'text':
              return (
                <ReactMarkdown
                  key={i}
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code: ({ children, className }) => (
                      <CodeBlock className={className} isStreaming={isStreaming} token={token}>
                        {children}
                      </CodeBlock>
                    ),
                    a: ({ children, href, ...props }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                        {children}
                      </a>
                    ),
                  }}
                >
                  {wrapMermaidBlocks(part.content)}
                </ReactMarkdown>
              )

            case 'tool_call':
              return (
                <ToolCall key={i} tool={part.tool} input={part.input} done={part.done} durationMs={part.durationMs} />
              )

            case 'error':
              return (
                <div key={i} className="message__error">
                  {part.content}
                </div>
              )

            default:
              return null
          }
        })}

        {message.parts.length === 0 && (
          <div className="message__typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}

        {!isStreaming && message.feedbackId && <FeedbackButtons feedbackId={message.feedbackId} authToken={token} />}
      </div>
    </div>
  )
}
