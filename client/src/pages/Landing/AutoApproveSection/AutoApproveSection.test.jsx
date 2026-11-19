import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AutoApproveSection from './AutoApproveSection.jsx'

describe('AutoApproveSection', () => {
  it('explains that Soporti approves only after a repo was tried in shadow', () => {
    render(<AutoApproveSection />)

    expect(screen.getByRole('heading', { name: 'Soporti approves the safe PRs, and only those.' })).toBeInTheDocument()
    expect(screen.getByText('shadow')).toBeInTheDocument()
    expect(screen.getByText(/only trivial PRs are approved/)).toBeInTheDocument()
  })

  it('shows a review where an unsure answer vetoes the approval, without naming the service or a path', () => {
    const { container } = render(<AutoApproveSection />)

    expect(container.querySelectorAll('.lp-auto-approve__gate')).toHaveLength(5)
    expect(container.querySelector('.lp-auto-approve__gate--veto')).toHaveTextContent('Personal data in logs?')
    expect(container).not.toHaveTextContent(/jev|\/admin/i)
  })
})
