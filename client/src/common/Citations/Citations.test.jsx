import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Citations from './Citations.jsx'

const CITATIONS = [
  { url: 'https://notion.so/refund-policy', title: 'Refund policy', host: 'notion.so', source: 'notion' },
  { url: 'https://stripe.com/docs/disputes', title: 'Disputes', host: 'stripe.com', source: '' },
]

describe('Citations', () => {
  it('renders a numbered row per citation with its title and host', () => {
    render(<Citations citations={CITATIONS} isOpen selectedUrl={null} onToggle={() => {}} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toBe('Refund policynotion.so1')
    expect(rows[1].textContent).toBe('Disputesstripe.com2')
  })

  it('counts the citations in the header', () => {
    render(<Citations citations={CITATIONS} isOpen={false} selectedUrl={null} onToggle={() => {}} />)

    expect(screen.getByRole('button', { name: /sources/i }).textContent).toContain('2')
  })

  it('opens each source in a new tab safely', () => {
    render(<Citations citations={CITATIONS} isOpen selectedUrl={null} onToggle={() => {}} />)

    const link = screen.getByRole('link', { name: /refund policy/i })
    expect(link).toHaveAttribute('href', 'https://notion.so/refund-policy')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('reports the open state and hides the collapsed panel from assistive tech', () => {
    const { container, rerender } = render(
      <Citations citations={CITATIONS} isOpen={false} selectedUrl={null} onToggle={() => {}} />
    )
    expect(screen.getByRole('button', { name: /sources/i })).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('.citations__panel')).toHaveAttribute('inert')

    rerender(<Citations citations={CITATIONS} isOpen selectedUrl={null} onToggle={() => {}} />)

    expect(screen.getByRole('button', { name: /sources/i })).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('.citations__panel')).not.toHaveAttribute('inert')
  })

  it('toggles when the header is clicked', async () => {
    const onToggle = vi.fn()
    render(<Citations citations={CITATIONS} isOpen={false} selectedUrl={null} onToggle={onToggle} />)

    await userEvent.click(screen.getByRole('button', { name: /sources/i }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('marks the selected citation as the current row', () => {
    render(
      <Citations citations={CITATIONS} isOpen selectedUrl="https://stripe.com/docs/disputes" onToggle={() => {}} />
    )

    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).not.toHaveAttribute('aria-current')
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
  })

  it('shows the integration icon for a known source and a globe for the rest', () => {
    const { container } = render(<Citations citations={CITATIONS} isOpen selectedUrl={null} onToggle={() => {}} />)

    expect(container.querySelector('[data-icon="notion"]')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="globe"]')).toBeInTheDocument()
  })
})
