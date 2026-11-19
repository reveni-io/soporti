import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CustomerRepliesSection from './CustomerRepliesSection.jsx'

describe('CustomerRepliesSection', () => {
  it('explains that Soporti drafts and Legal decides, without naming the service behind the check or a path', () => {
    const { container } = render(<CustomerRepliesSection />)

    expect(
      screen.getByRole('heading', { name: 'Soporti drafts the replies. Legal decides what goes out.' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Nothing is sent: edit the reply, copy it and send it from the ticket/)).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/jev|\/admin/i)
  })

  it('shows a run with the cases that need a second look', () => {
    const { container } = render(<CustomerRepliesSection />)

    expect(container.querySelectorAll('.lp-replies__case')).toHaveLength(3)
    expect(container.querySelectorAll('.lp-replies__case--careful')).toHaveLength(2)
  })
})
