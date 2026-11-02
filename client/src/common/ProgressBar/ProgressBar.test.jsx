import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProgressBar from './ProgressBar.jsx'

describe('ProgressBar', () => {
  it('exposes the progress to assistive technology', () => {
    render(<ProgressBar value={42} label="Render progress" />)

    const bar = screen.getByRole('progressbar', { name: 'Render progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('keeps the value between 0 and 100', () => {
    render(<ProgressBar value={140} label="Render progress" />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})
