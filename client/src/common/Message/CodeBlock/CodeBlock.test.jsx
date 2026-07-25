import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CodeBlock from './CodeBlock.jsx'

vi.mock('../../MermaidDiagram/MermaidDiagram.jsx', () => ({
  default: ({ chart }) => <div data-testid="mermaid">{chart}</div>,
}))

vi.mock('../../ChartBlock/ChartBlock.jsx', () => ({
  default: ({ data }) => <div data-testid="chart">{data}</div>,
}))

vi.mock('../../CsvBlock/CsvBlock.jsx', () => ({
  default: ({ csv, canDownload }) => (
    <div data-testid="csv" data-can-download={canDownload}>
      {csv}
    </div>
  ),
}))

describe('CodeBlock', () => {
  it('renders inline code when there is no language', () => {
    const { container } = render(<CodeBlock isStreaming={false}>total_sales</CodeBlock>)

    expect(container.querySelector('.inline-code').textContent).toBe('total_sales')
  })

  it('renders a highlighted block with its language and a copy button', () => {
    render(
      <CodeBlock className="language-sql" isStreaming={false}>
        {'SELECT 1\n'}
      </CodeBlock>
    )

    expect(screen.getByText('sql')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })

  it('hides the copy button while streaming', () => {
    render(
      <CodeBlock className="language-sql" isStreaming>
        SELECT 1
      </CodeBlock>
    )

    expect(screen.queryByRole('button', { name: 'Copy code' })).not.toBeInTheDocument()
  })

  it('renders a mermaid diagram once the stream is done', () => {
    render(
      <CodeBlock className="language-mermaid" isStreaming={false} token="tok">
        flowchart TD
      </CodeBlock>
    )

    expect(screen.getByTestId('mermaid').textContent).toBe('flowchart TD')
  })

  it('shows a skeleton instead of the diagram while streaming', () => {
    const { container } = render(
      <CodeBlock className="language-mermaid" isStreaming>
        flowchart TD
      </CodeBlock>
    )

    expect(container.querySelector('.mermaid-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('mermaid')).not.toBeInTheDocument()
  })

  it('renders a chart once the stream is done', () => {
    render(
      <CodeBlock className="language-chart" isStreaming={false}>
        {'{"type":"bar"}'}
      </CodeBlock>
    )

    expect(screen.getByTestId('chart').textContent).toBe('{"type":"bar"}')
  })

  it('shows a bar skeleton instead of the chart while streaming', () => {
    const { container } = render(
      <CodeBlock className="language-chart" isStreaming>
        {'{"type":"bar"}'}
      </CodeBlock>
    )

    expect(container.querySelectorAll('.chart-skeleton__bar')).toHaveLength(5)
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })

  it('renders a csv table and only allows the download once the stream is done', () => {
    const { rerender } = render(
      <CodeBlock className="language-csv" isStreaming>
        a,b
      </CodeBlock>
    )
    expect(screen.getByTestId('csv')).toHaveAttribute('data-can-download', 'false')

    rerender(
      <CodeBlock className="language-csv" isStreaming={false}>
        a,b
      </CodeBlock>
    )

    expect(screen.getByTestId('csv')).toHaveAttribute('data-can-download', 'true')
  })
})
