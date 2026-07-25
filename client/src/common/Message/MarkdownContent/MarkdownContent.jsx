import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from '../CodeBlock/CodeBlock.jsx'
import { wrapMermaidBlocks } from '../wrap-mermaid-blocks.js'

const REMARK_PLUGINS = [remarkGfm]

export default function MarkdownContent({ content, isStreaming, token }) {
  const components = {
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
  }

  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {wrapMermaidBlocks(content)}
    </ReactMarkdown>
  )
}
