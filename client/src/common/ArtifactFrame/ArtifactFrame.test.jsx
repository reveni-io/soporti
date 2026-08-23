import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { screen, act } from '@testing-library/react'
import { render, waitFor } from '@testing-library/react'
import ArtifactFrame from './ArtifactFrame.jsx'
import { inlineArtifactCharts } from './inline-artifact-charts.js'
import { ARTIFACT_HEIGHT_MESSAGE, ARTIFACT_PRINT_MESSAGE } from './artifact-runtime.js'

vi.mock('./inline-artifact-charts.js', () => ({
  inlineArtifactCharts: vi.fn(async html =>
    html.replace(/<div data-chart=[^>]*><\/div>/, '<div class="chart-block">rendered-chart</div>')
  ),
}))

describe('ArtifactFrame', () => {
  it('renders the artifact in a scripts-and-modals sandbox, never same-origin', () => {
    render(<ArtifactFrame html="<h1>Refunds</h1>" title="Refund dashboard" />)

    const frame = screen.getByTitle('Refund dashboard')
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-modals')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
  })

  it('asks the frame document to print itself when the handle is used', () => {
    const ref = createRef()
    render(<ArtifactFrame html="<h1>Refunds</h1>" title="Refund dashboard" ref={ref} />)

    const frame = screen.getByTitle('Refund dashboard')
    const postMessage = vi.spyOn(frame.contentWindow, 'postMessage')

    act(() => ref.current.print())

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith({ type: ARTIFACT_PRINT_MESSAGE }, '*')
  })

  it('replaces chart placeholders with charts rendered by the app before the frame loads', async () => {
    render(<ArtifactFrame html={'<h1>Report</h1><div data-chart=\'{"type":"bar"}\'></div>'} title="Report" />)

    await waitFor(() => expect(screen.getByTitle('Report')).toBeInTheDocument())
    expect(screen.getByTitle('Report').getAttribute('srcdoc')).toContain('rendered-chart')
  })

  it('hands the inliner the width of its own container', async () => {
    const html = '<div data-chart=\'{"type":"bar"}\'></div>'
    render(<ArtifactFrame html={html} title="Report" />)

    await waitFor(() => expect(screen.getByTitle('Report')).toBeInTheDocument())
    expect(inlineArtifactCharts).toHaveBeenCalledWith(html, expect.any(Number))
  })

  it('shows no frame until the charts are inlined', () => {
    inlineArtifactCharts.mockReturnValueOnce(new Promise(() => {}))

    const { container } = render(<ArtifactFrame html={'<div data-chart=\'{"type":"bar"}\'></div>'} title="Report" />)

    expect(container.querySelector('iframe')).toBeNull()
  })

  it('never touches the chart inliner for an artifact without charts', () => {
    inlineArtifactCharts.mockClear()
    render(<ArtifactFrame html="<h1>Refunds</h1>" title="Refund dashboard" />)

    expect(inlineArtifactCharts).not.toHaveBeenCalled()
    expect(screen.getByTitle('Refund dashboard')).toBeInTheDocument()
  })

  it('renders the html through srcdoc rather than a src url', () => {
    render(<ArtifactFrame html="<h1>Refunds</h1>" title="Refund dashboard" />)

    const frame = screen.getByTitle('Refund dashboard')
    expect(frame.getAttribute('srcdoc')).toContain('<h1>Refunds</h1>')
    expect(frame.getAttribute('src')).toBeNull()
  })

  it('grows to the height the artifact reports', () => {
    render(<ArtifactFrame html="<h1>Refunds</h1>" title="Refund dashboard" />)
    const frame = screen.getByTitle('Refund dashboard')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: ARTIFACT_HEIGHT_MESSAGE, height: 900 },
          source: frame.contentWindow,
        })
      )
    })

    expect(frame.style.height).toBe('900px')
  })

  it('ignores a height message from any window that is not this frame', () => {
    render(<ArtifactFrame html="<h1>Refunds</h1>" title="Refund dashboard" />)
    const frame = screen.getByTitle('Refund dashboard')
    const before = frame.style.height

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: ARTIFACT_HEIGHT_MESSAGE, height: 900 },
          source: window,
        })
      )
    })

    expect(frame.style.height).toBe(before)
  })

  it('ignores a message of another type from the frame', () => {
    render(<ArtifactFrame html="<h1>Refunds</h1>" title="Refund dashboard" />)
    const frame = screen.getByTitle('Refund dashboard')
    const before = frame.style.height

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'something_else', height: 900 },
          source: frame.contentWindow,
        })
      )
    })

    expect(frame.style.height).toBe(before)
  })

  it('caps the height so a runaway artifact cannot blow up the panel', () => {
    render(<ArtifactFrame html="<h1>Refunds</h1>" title="Refund dashboard" />)
    const frame = screen.getByTitle('Refund dashboard')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: ARTIFACT_HEIGHT_MESSAGE, height: 9_000_000 },
          source: frame.contentWindow,
        })
      )
    })

    expect(frame.style.height).toBe('20000px')
  })

  it('ignores a height that is not a positive number', () => {
    render(<ArtifactFrame html="<h1>Refunds</h1>" title="Refund dashboard" />)
    const frame = screen.getByTitle('Refund dashboard')
    const before = frame.style.height

    for (const height of [0, -5, 'tall', null]) {
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: ARTIFACT_HEIGHT_MESSAGE, height },
            source: frame.contentWindow,
          })
        )
      })
    }

    expect(frame.style.height).toBe(before)
  })

  it('resets the height when a new version is loaded', () => {
    const { rerender } = render(<ArtifactFrame html="<h1>v1</h1>" title="Refund dashboard" />)
    const frame = screen.getByTitle('Refund dashboard')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: ARTIFACT_HEIGHT_MESSAGE, height: 900 },
          source: frame.contentWindow,
        })
      )
    })
    expect(frame.style.height).toBe('900px')

    rerender(<ArtifactFrame html="<h1>v2</h1>" title="Refund dashboard" />)

    expect(screen.getByTitle('Refund dashboard').style.height).toBe('320px')
  })
})
