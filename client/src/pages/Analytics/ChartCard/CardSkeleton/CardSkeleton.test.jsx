import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CardSkeleton from './CardSkeleton.jsx'

describe('CardSkeleton', () => {
  it('shows the step alone when it is given no prompt', () => {
    const { container } = render(<CardSkeleton step="Listing the tables" prompt="" />)

    expect(screen.getByRole('status')).toHaveTextContent('Listing the tables…')
    expect(container.querySelector('.card-skeleton__prompt')).toBeNull()
  })

  it('shows the step the assistant is on and the prompt it is answering', () => {
    render(<CardSkeleton step="Reading the columns of orders" prompt="Orders per week over the last 3 months" />)

    expect(screen.getByRole('status')).toHaveTextContent('Reading the columns of orders…')
    expect(screen.getByText('Orders per week over the last 3 months')).toBeInTheDocument()
  })

  it('says it is thinking until the first step arrives', () => {
    render(<CardSkeleton step={null} prompt="Orders per week" />)

    expect(screen.getByRole('status')).toHaveTextContent('Thinking…')
  })

  it('draws five placeholder columns that assistive technology skips', () => {
    const { container } = render(<CardSkeleton step={null} prompt="Orders per week" />)

    expect(container.querySelectorAll('.card-skeleton__bar')).toHaveLength(5)
    expect(container.querySelector('.card-skeleton__bars')).toHaveAttribute('aria-hidden', 'true')
  })
})
