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
    <SyntaxHighlighter
      style={oneDark}
      language={language}
      PreTag="div"
      customStyle={{ margin: '8px 0', borderRadius: '8px', fontSize: '13px', background: '#042503' }}
      codeTagProps={{ style: { background: 'transparent' } }}
    >
      {code}
    </SyntaxHighlighter>
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
