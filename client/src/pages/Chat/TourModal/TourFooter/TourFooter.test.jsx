import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TourFooter from './TourFooter.jsx'

const STEP_IDS = ['intro', 'sources', 'tips']

const BASE_PROPS = {
  stepIds: STEP_IDS,
  stepIndex: 0,
  onSelect: vi.fn(),
  onBack: vi.fn(),
  onNext: vi.fn(),
  onFinish: vi.fn(),
}

describe('TourFooter', () => {
  it('renders a dot per step and marks the current one', () => {
    render(<TourFooter {...BASE_PROPS} stepIndex={1} />)

    expect(screen.getByLabelText('Go to step 1').className).not.toContain('tour-modal__dot--active')
    expect(screen.getByLabelText('Go to step 2').className).toContain('tour-modal__dot--active')
    expect(screen.getByLabelText('Go to step 3')).toBeInTheDocument()
  })

  it('jumps to the step behind a dot', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<TourFooter {...BASE_PROPS} onSelect={onSelect} />)

    await user.click(screen.getByLabelText('Go to step 3'))

    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('hides Back on the first step', () => {
    render(<TourFooter {...BASE_PROPS} />)

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('goes back and forward', async () => {
    const onBack = vi.fn()
    const onNext = vi.fn()
    const user = userEvent.setup()
    render(<TourFooter {...BASE_PROPS} stepIndex={1} onBack={onBack} onNext={onNext} />)

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('finishes the tour from the last step', async () => {
    const onFinish = vi.fn()
    const user = userEvent.setup()
    render(<TourFooter {...BASE_PROPS} stepIndex={2} onFinish={onFinish} />)

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start asking' }))

    expect(onFinish).toHaveBeenCalledTimes(1)
  })
})
