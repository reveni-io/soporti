import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SendcloudSection from './SendcloudSection.jsx'

describe('SendcloudSection', () => {
  it('explains that several accounts are linked from /admin', () => {
    render(<SendcloudSection />)

    expect(screen.getByRole('heading', { name: /Where is the parcel/ })).toBeInTheDocument()
    expect(screen.getByText('/admin')).toBeInTheDocument()
    expect(screen.getByText(/one per brand or store/)).toBeInTheDocument()
  })

  it('lists what it reads and promises it never writes', () => {
    const { container } = render(<SendcloudSection />)

    expect(container.querySelectorAll('.lp-points li')).toHaveLength(7)
    expect(screen.getByText(/never creates a label, cancels a parcel or edits an address/)).toBeInTheDocument()
  })

  it('shows a tracking timeline with the failed delivery highlighted', () => {
    const { container } = render(<SendcloudSection />)

    expect(container.querySelectorAll('.lp-sendcloud__event')).toHaveLength(4)
    expect(container.querySelector('.lp-sendcloud__event--warning')).toHaveTextContent('recipient not home')
  })
})
