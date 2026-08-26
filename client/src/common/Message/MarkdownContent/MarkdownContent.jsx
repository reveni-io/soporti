import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from '../CodeBlock/CodeBlock.jsx'
import CitationMarker from '../../Citations/CitationMarker/CitationMarker.jsx'
import { wrapMermaidBlocks } from '../wrap-mermaid-blocks.js'

const REMARK_PLUGINS = [remarkGfm]
const NO_CITATIONS = []

export default function MarkdownContent({ content, isStreaming, token, citations = NO_CITATIONS, onSelectCitation }) {
  const code = useMemo(
    () =>
      function MarkdownCode({ children, className }) {
        return (
          <CodeBlock className={className} isStreaming={isStreaming} token={token}>
            {children}
          </CodeBlock>
        )
      },
    [isStreaming, token]
  )

  const a = useMemo(
    () =>
      function MarkdownLink({ children, href, ...props }) {
        return (
          <>
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
            <CitationMarker citations={citations} url={href} onSelect={onSelectCitation} />
          </>
        )
      },
    [citations, onSelectCitation]
  )

  const components = useMemo(() => ({ code, a }), [code, a])
  const markdown = useMemo(() => wrapMermaidBlocks(content), [content])

  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {markdown}
    </ReactMarkdown>
  )
}
