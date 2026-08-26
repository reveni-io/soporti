import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MessageRail from './MessageRail.jsx'

describe('MessageRail', () => {
  it('renders nothing when there are no messages', () => {
    const { container } = render(<MessageRail items={[]} progress={0} activeIndex={0} onSelect={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders one labelled control per message', () => {
    const items = [
      { index: 0, role: 'user', preview: 'How do refunds work?', label: 'Question 1: How do refunds work?' },
      { index: 1, role: 'assistant', preview: 'Within 14 days.', label: 'Answer 2: Within 14 days.' },
    ]

    render(<MessageRail items={items} progress={0} activeIndex={0} onSelect={vi.fn()} />)

    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Question 1: How do refunds work?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Answer 2: Within 14 days.' })).toBeInTheDocument()
  })

  it('shows the preview text of each message', () => {
    const items = [{ index: 0, role: 'user', preview: 'How do refunds work?', label: 'Question 1' }]

    render(<MessageRail items={items} progress={0} activeIndex={0} onSelect={vi.fn()} />)

    expect(screen.getByText('How do refunds work?')).toBeInTheDocument()
  })

  it('marks only the active message as the current one', () => {
    const items = [
      { index: 0, role: 'user', preview: 'First', label: 'Question 1: First' },
      { index: 1, role: 'assistant', preview: 'Second', label: 'Answer 2: Second' },
    ]

    render(<MessageRail items={items} progress={1} activeIndex={1} onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Question 1: First' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Answer 2: Second' })).toHaveAttribute('aria-current', 'true')
  })

  it('distinguishes questions from answers and highlights the active one', () => {
    const items = [
      { index: 0, role: 'user', preview: 'First', label: 'Question 1: First' },
      { index: 1, role: 'assistant', preview: 'Second', label: 'Answer 2: Second' },
    ]

    render(<MessageRail items={items} progress={1} activeIndex={1} onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Question 1: First' })).toHaveClass('rail__btn--user')
    expect(screen.getByRole('button', { name: 'Answer 2: Second' })).toHaveClass('rail__btn--assistant')
    expect(screen.getByRole('button', { name: 'Answer 2: Second' })).toHaveClass('rail__btn--active')
    expect(screen.getByRole('button', { name: 'Question 1: First' })).not.toHaveClass('rail__btn--active')
  })

  it('shrinks and dims each tick the further it sits from the active message', () => {
    const items = [0, 1, 2, 3, 4].map(index => ({
      index,
      role: 'user',
      preview: `Message ${index}`,
      label: `Question ${index + 1}: Message ${index}`,
    }))

    render(<MessageRail items={items} progress={0} activeIndex={0} onSelect={vi.fn()} />)

    const scales = items.map(item =>
      Number(screen.getByRole('button', { name: item.label }).style.getPropertyValue('--rail-tick-scale'))
    )
    const opacities = items.map(item =>
      Number(screen.getByRole('button', { name: item.label }).style.getPropertyValue('--rail-tick-opacity'))
    )

    expect(scales).toEqual([1, 0.68, 0.44, 0.25, 0.25])
    expect(opacities).toEqual([1, 0.6, 0.45, 0.35, 0.35])
  })

  it('interpolates the ticks while the reader scrolls between two messages', () => {
    const items = [
      { index: 0, role: 'user', preview: 'First', label: 'Question 1: First' },
      { index: 1, role: 'assistant', preview: 'Second', label: 'Answer 2: Second' },
    ]

    render(<MessageRail items={items} progress={0.5} activeIndex={1} onSelect={vi.fn()} />)

    const first = screen.getByRole('button', { name: 'Question 1: First' })
    const second = screen.getByRole('button', { name: 'Answer 2: Second' })

    expect(Number(first.style.getPropertyValue('--rail-tick-scale'))).toBeCloseTo(0.84)
    expect(Number(second.style.getPropertyValue('--rail-tick-scale'))).toBeCloseTo(0.84)
  })

  it('selects the message that was clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const items = [
      { index: 0, role: 'user', preview: 'First', label: 'Question 1: First' },
      { index: 1, role: 'assistant', preview: 'Second', label: 'Answer 2: Second' },
    ]

    render(<MessageRail items={items} progress={0} activeIndex={0} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Answer 2: Second' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
