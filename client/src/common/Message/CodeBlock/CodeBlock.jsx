import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ChartBlock from '../../ChartBlock/ChartBlock.jsx'
import CsvBlock from '../../CsvBlock/CsvBlock.jsx'
import CopyButton from '../../CopyButton/CopyButton.jsx'
import MermaidDiagram from '../../MermaidDiagram/MermaidDiagram.jsx'

const LANGUAGE_RE = /language-(\w+)/
const CODE_STYLE = { margin: 0, borderRadius: 0, fontSize: '13px', background: '#042503' }
const CODE_TAG_PROPS = { style: { background: 'transparent' } }
const CHART_SKELETON_HEIGHTS = ['60%', '85%', '45%', '70%', '55%']

export default function CodeBlock({ children, className, isStreaming, token }) {
  const match = LANGUAGE_RE.exec(className || '')
  const language = match ? match[1] : ''
  const code = String(children).replace(/\n$/, '')

  if (language === 'mermaid') {
    if (isStreaming) return <MermaidSkeleton />
    return <MermaidDiagram chart={code} token={token} />
  }

  if (language === 'chart') {
    if (isStreaming) return <ChartSkeleton />
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
        {!isStreaming && <CopyButton text={code} ariaLabel="Copy code" variant="inverse" />}
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={CODE_STYLE}
        codeTagProps={CODE_TAG_PROPS}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

function MermaidSkeleton() {
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

function ChartSkeleton() {
  return (
    <div className="chart-block chart-block--pending">
      <div className="chart-skeleton">
        <div className="chart-skeleton__title" />
        <div className="chart-skeleton__area">
          {CHART_SKELETON_HEIGHTS.map(height => (
            <div key={height} className="chart-skeleton__bar" style={{ height }} />
          ))}
        </div>
      </div>
    </div>
  )
}
