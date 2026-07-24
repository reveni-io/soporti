import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Message from './Message.jsx'

vi.mock('react-syntax-highlighter', () => ({
  Prism: ({ children }) => <pre data-testid="code-block">{children}</pre>,
}))

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  oneDark: {},
}))

vi.mock('react-markdown', () => ({
  default: function MockMarkdown({ children, components }) {
    const codeMatch = typeof children === 'string' && children.match(/```(\w+)\n([\s\S]*?)```/)
    if (codeMatch && components?.code) {
      const Code = components.code
      return (
        <div data-testid="markdown">
          <Code className={`language-${codeMatch[1]}`}>{codeMatch[2]}</Code>
        </div>
      )
    }
    const noLangMatch = typeof children === 'string' && children.match(/```\n([\s\S]*?)```/)
    if (noLangMatch && components?.code) {
      const Code = components.code
      return (
        <div data-testid="markdown">
          <Code>{noLangMatch[1]}</Code>
        </div>
      )
    }
    return <div data-testid="markdown">{children}</div>
  },
}))

vi.mock('remark-gfm', () => ({
  default: () => {},
}))

vi.mock('../MermaidDiagram/MermaidDiagram.jsx', () => ({
  default: ({ chart }) => <div data-testid="mermaid">{chart}</div>,
}))

vi.mock('../ChartBlock/ChartBlock.jsx', () => ({
  default: ({ data }) => <div data-testid="chart">{data}</div>,
}))

describe('Message', () => {
  it('renders user message', () => {
    render(<Message message={{ role: 'user', content: 'Hello' }} isStreaming={false} token="tok" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('renders assistant text parts', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: 'Hi there' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByTestId('markdown')).toBeInTheDocument()
  })

  it('renders tool_call parts', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'tool_call', tool: 'search_code', input: {}, done: true }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByText('Searching code')).toBeInTheDocument()
  })

  it('renders error parts', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'error', content: 'Something went wrong' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders multiple parts', () => {
    const message = {
      role: 'assistant',
      parts: [
        { type: 'tool_call', tool: 'list_repos', input: {}, done: true },
        { type: 'text', content: 'Found 5 repos' },
      ],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByText('Listing repositories')).toBeInTheDocument()
    expect(screen.getByTestId('markdown')).toBeInTheDocument()
  })

  it('applies user message CSS class', () => {
    const { container } = render(<Message message={{ role: 'user', content: 'Hi' }} isStreaming={false} token="tok" />)
    expect(container.querySelector('.message--user')).toBeTruthy()
  })

  it('applies assistant message CSS class', () => {
    const { container } = render(<Message message={{ role: 'assistant', parts: [] }} isStreaming={false} token="tok" />)
    expect(container.querySelector('.message--assistant')).toBeTruthy()
  })

  it('renders typing indicator when parts is empty', () => {
    const { container } = render(<Message message={{ role: 'assistant', parts: [] }} isStreaming={true} token="tok" />)
    expect(container.querySelector('.message__typing')).toBeTruthy()
  })

  it('renders mermaid skeleton during streaming', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```mermaid\ngraph TD\nA-->B\n```' }],
    }
    const { container } = render(<Message message={message} isStreaming={true} token="tok" />)
    expect(container.querySelector('.mermaid-skeleton')).toBeTruthy()
  })

  it('renders mermaid diagram when not streaming', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```mermaid\ngraph TD\nA-->B\n```' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByTestId('mermaid')).toBeInTheDocument()
  })

  it('renders chart skeleton during streaming', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```chart\n{"type":"bar"}\n```' }],
    }
    const { container } = render(<Message message={message} isStreaming={true} token="tok" />)
    expect(container.querySelector('.chart-skeleton')).toBeTruthy()
  })

  it('renders chart block when not streaming', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```chart\n{"type":"bar"}\n```' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('renders a CSV block with a download button when not streaming', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```csv\nid,name\n1,Acme\n```' }],
    }
    const { container } = render(<Message message={message} isStreaming={false} token="tok" />)
    expect(container.querySelector('.csv-block')).toBeTruthy()
    expect(screen.getByRole('button', { name: /download csv/i })).toBeInTheDocument()
  })

  it('renders a CSV block without a download button while streaming', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```csv\nid,name\n1,Acme\n```' }],
    }
    const { container } = render(<Message message={message} isStreaming={true} token="tok" />)
    expect(container.querySelector('.csv-block')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /download csv/i })).not.toBeInTheDocument()
  })

  it('renders inline code when no language is specified', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```\nsome code\n```' }],
    }
    const { container } = render(<Message message={message} isStreaming={false} token="tok" />)
    expect(container.querySelector('.inline-code')).toBeTruthy()
  })

  it('renders syntax highlighted code block for known language', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```javascript\nconst x = 1;\n```' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByTestId('code-block')).toBeInTheDocument()
  })

  it('renders a copy button on code blocks when not streaming', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```javascript\nconst x = 1;\n```' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
  })

  it('does not render a copy button on code blocks while streaming', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```javascript\nconst x = 1;\n```' }],
    }
    render(<Message message={message} isStreaming={true} token="tok" />)
    expect(screen.queryByRole('button', { name: /copy code/i })).not.toBeInTheDocument()
  })

  it('copies the code to the clipboard and shows feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```javascript\nconst x = 1;\n```' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)

    await userEvent.click(screen.getByRole('button', { name: /copy code/i }))

    expect(writeText).toHaveBeenCalledWith('const x = 1;')
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument())
  })

  it('does not render a copy button on inline code', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```\nsome code\n```' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.queryByRole('button', { name: /copy code/i })).not.toBeInTheDocument()
  })

  it('returns null for unknown part types', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'unknown_type', content: 'test' }],
    }
    const { container } = render(<Message message={message} isStreaming={false} token="tok" />)
    expect(container.querySelector('.message__bubble--assistant')).toBeTruthy()
    expect(container.querySelector('.message__bubble--assistant').textContent).toBe('')
  })

  it('wraps plain mermaid flowchart blocks in fences', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: 'flowchart TD\n  A-->B\n  B-->C' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByTestId('mermaid')).toBeInTheDocument()
  })

  it('wraps plain mermaid graph blocks in fences', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: 'graph LR\n  A-->B\n  B-->C' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByTestId('mermaid')).toBeInTheDocument()
  })

  it('does not wrap single-line mermaid keyword as a block', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: 'flowchart TD\nSome regular text' }],
    }
    const { container } = render(<Message message={message} isStreaming={false} token="tok" />)
    expect(container.querySelector('[data-testid="mermaid"]')).toBeNull()
  })

  it('does not modify content inside existing fences', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'text', content: '```javascript\nflowchart TD\n  A-->B\n```' }],
    }
    render(<Message message={message} isStreaming={false} token="tok" />)
    expect(screen.getByTestId('code-block')).toBeInTheDocument()
    expect(screen.queryByTestId('mermaid')).not.toBeInTheDocument()
  })
})
