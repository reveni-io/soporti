import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SkillMenu from './SkillMenu.jsx'

const SKILLS = [
  { id: 1, name: 'triage-ticket', description: 'Triage a support ticket' },
  { id: 2, name: 'trace-order' },
]

describe('SkillMenu', () => {
  it('tells the user when nothing matches', () => {
    render(<SkillMenu skills={[]} activeIndex={0} onSelect={vi.fn()} />)

    expect(screen.getByText('No matching skills')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('lists the skills with their descriptions', () => {
    render(<SkillMenu skills={SKILLS} activeIndex={0} onSelect={vi.fn()} />)

    expect(screen.getByText('/triage-ticket')).toBeInTheDocument()
    expect(screen.getByText('Triage a support ticket')).toBeInTheDocument()
    expect(screen.getByText('/trace-order')).toBeInTheDocument()
  })

  it('marks the active option', () => {
    render(<SkillMenu skills={SKILLS} activeIndex={1} onSelect={vi.fn()} />)

    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveClass('chat__skill-menu-item--active')
  })

  it('selects a skill without stealing focus from the textarea', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<SkillMenu skills={SKILLS} activeIndex={0} onSelect={onSelect} />)

    await user.click(screen.getByText('/trace-order'))

    expect(onSelect).toHaveBeenCalledWith(SKILLS[1])
  })
})
