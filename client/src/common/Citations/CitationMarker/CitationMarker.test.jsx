import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CitationMarker from './CitationMarker.jsx'

const CITATIONS = [
  { url: 'https://notion.so/refund-policy', title: 'Refund policy', host: 'notion.so', source: 'notion' },
  { url: 'https://sentry.io/issues/1', title: 'TypeError', host: 'sentry.io', source: 'sentry' },
]

describe('CitationMarker', () => {
  it('shows the position of the cited source', () => {
    render(<CitationMarker citations={CITATIONS} url="https://sentry.io/issues/1" onSelect={() => {}} />)

    const marker = screen.getByRole('button', { name: 'Source 2: sentry.io' })
    expect(marker.textContent).toBe('2')
    expect(marker).toHaveAttribute('title', 'TypeError')
  })

  it('selects its source when clicked', async () => {
    const onSelect = vi.fn()
    render(<CitationMarker citations={CITATIONS} url="https://notion.so/refund-policy" onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: /source 1/i }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('https://notion.so/refund-policy')
  })

  it('renders nothing for a link that is not a cited source', () => {
    render(<CitationMarker citations={CITATIONS} url="https://example.com/other" onSelect={() => {}} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders nothing when there are no citations', () => {
    render(<CitationMarker citations={[]} url="https://notion.so/refund-policy" onSelect={() => {}} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
