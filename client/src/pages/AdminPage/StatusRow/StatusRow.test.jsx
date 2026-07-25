import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusRow from './StatusRow.jsx'

describe('StatusRow', () => {
  it('marks a configured integration with the success badge', () => {
    render(<StatusRow configured />)

    expect(screen.getByText('configured')).toHaveClass('badge', 'badge--success')
  })

  it('marks an unconfigured integration with the plain badge', () => {
    render(<StatusRow configured={false} />)

    const badge = screen.getByText('not configured')
    expect(badge).toHaveClass('badge')
    expect(badge).not.toHaveClass('badge--success')
  })

  it('uses the labels it is given', () => {
    render(<StatusRow configured={false} configuredLabel="enabled" unconfiguredLabel="disabled" />)

    expect(screen.getByText('disabled')).toBeInTheDocument()
    expect(screen.queryByText('not configured')).not.toBeInTheDocument()
  })
})
