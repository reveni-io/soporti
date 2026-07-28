import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MarkdownContent from './MarkdownContent.jsx'

describe('MarkdownContent', () => {
  it('renders markdown as html', () => {
    render(<MarkdownContent content={'# Title\n\nSome **bold** text.'} isStreaming={false} />)

    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('bold')).toBeInTheDocument()
  })

  it('renders github-flavoured tables', () => {
    render(<MarkdownContent content={'| a | b |\n| - | - |\n| 1 | 2 |'} isStreaming={false} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument()
  })

  it('opens links in a new tab safely', () => {
    render(<MarkdownContent content="[docs](https://example.com)" isStreaming={false} />)

    const link = screen.getByRole('link', { name: 'docs' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('routes fenced code through the code block', () => {
    render(<MarkdownContent content={'```sql\nSELECT 1\n```'} isStreaming={false} />)

    expect(screen.getByText('sql')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })

  it('fences a bare mermaid diagram before rendering it', () => {
    const { container } = render(<MarkdownContent content={'flowchart TD\n  A --> B'} isStreaming token="tok" />)

    expect(container.querySelector('.mermaid-skeleton')).toBeInTheDocument()
  })

  it('keeps a rendered diagram mounted when re-rendered with the same content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ svg: '<svg><text>Diagram</text></svg>' }),
    })
    const content = '```mermaid\nflowchart TD\n  A --> B\n```'

    const { container, rerender } = render(<MarkdownContent content={content} isStreaming={false} token="tok" />)
    await waitFor(() => expect(container.querySelector('svg')).toBeTruthy())
    const diagram = container.querySelector('.mermaid-diagram')

    rerender(<MarkdownContent content={content} isStreaming={false} token="tok" />)

    expect(container.querySelector('.mermaid-diagram')).toBe(diagram)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/mermaid/render')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(options.body)).toEqual({ chart: 'flowchart TD\n  A --> B' })
  })

  it('keeps a rendered chart mounted when re-rendered with the same content', () => {
    const content = '```chart\n{"type":"bar","data":[{"name":"a","value":1}]}\n```'

    const { container, rerender } = render(<MarkdownContent content={content} isStreaming={false} token="tok" />)
    const chart = container.querySelector('.chart-block')

    rerender(<MarkdownContent content={content} isStreaming={false} token="tok" />)

    expect(container.querySelector('.chart-block')).toBe(chart)
  })
})
