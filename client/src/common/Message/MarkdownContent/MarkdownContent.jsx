import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from '../CodeBlock/CodeBlock.jsx'
import { wrapMermaidBlocks } from '../wrap-mermaid-blocks.js'

const REMARK_PLUGINS = [remarkGfm]

function MarkdownLink({ children, href, ...props }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  )
}

export default function MarkdownContent({ content, isStreaming, token }) {
  const components = useMemo(
    () => ({
      code: function MarkdownCode({ children, className }) {
        return (
          <CodeBlock className={className} isStreaming={isStreaming} token={token}>
            {children}
          </CodeBlock>
        )
      },
      a: MarkdownLink,
    }),
    [isStreaming, token]
  )

  const markdown = useMemo(() => wrapMermaidBlocks(content), [content])

  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {markdown}
    </ReactMarkdown>
  )
}
