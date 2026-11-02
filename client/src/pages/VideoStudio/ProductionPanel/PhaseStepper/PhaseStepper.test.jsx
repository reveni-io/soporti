import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PhaseStepper from './PhaseStepper.jsx'

function currentStep() {
  return screen.getAllByRole('listitem').find(item => item.getAttribute('aria-current') === 'step')
}

describe('PhaseStepper', () => {
  it('lists every step of the generation', () => {
    render(<PhaseStepper phase="composing" />)

    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'Preparing',
      'Composing',
      'Music',
      'Rendering',
      'Ready',
    ])
  })

  it.each([
    ['preparing', 'Preparing'],
    ['music', 'Music'],
    ['rendering', 'Rendering'],
    ['finalizing', 'Rendering'],
    [null, 'Preparing'],
  ])('marks the current step for the %s phase', (phase, label) => {
    render(<PhaseStepper phase={phase} />)

    expect(currentStep()).toHaveTextContent(label)
  })

  it('marks the steps already done', () => {
    render(<PhaseStepper phase="music" />)

    expect(screen.getByText('Preparing')).toHaveClass('phase-stepper__step--done')
    expect(screen.getByText('Composing')).toHaveClass('phase-stepper__step--done')
    expect(screen.getByText('Ready')).toHaveClass('phase-stepper__step--pending')
  })
})
