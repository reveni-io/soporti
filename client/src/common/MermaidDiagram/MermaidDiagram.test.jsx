import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MermaidDiagram from './MermaidDiagram.jsx'

describe('MermaidDiagram', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows chart code while loading', () => {
    global.fetch = vi.fn(() => new Promise(() => {}))
    render(<MermaidDiagram chart="flowchart TD\n    A --> B" token="tok" />)
    expect(screen.getByText(/flowchart TD/)).toBeInTheDocument()
  })

  it('renders SVG on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ svg: '<svg><text>Diagram</text></svg>' }),
    })

    const { container } = render(<MermaidDiagram chart="flowchart TD\n    A --> B" token="tok" />)

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeTruthy()
    })
  })

  it('shows error fallback on render failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Parse error' }),
    })

    render(<MermaidDiagram chart="invalid diagram" token="tok" />)

    await waitFor(() => {
      expect(screen.getByText(/invalid diagram/)).toBeInTheDocument()
    })
  })

  it('shows error fallback on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(<MermaidDiagram chart="flowchart TD" token="tok" />)

    await waitFor(() => {
      expect(screen.getByText(/flowchart TD/)).toBeInTheDocument()
    })
  })
})
