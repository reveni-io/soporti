import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SourceItem from './SourceItem.jsx'

describe('SourceItem', () => {
  it('renders the name, language and description', () => {
    render(<SourceItem name="org/app" description="Main app" language="JavaScript" selected={false} />)

    expect(screen.getByText('org/app')).toBeInTheDocument()
    expect(screen.getByText('Main app')).toBeInTheDocument()
    expect(screen.getByText('JavaScript')).toBeInTheDocument()
  })

  it('omits the language and description when they are missing', () => {
    const { container } = render(<SourceItem name="org/bare" selected={false} />)

    expect(container.querySelector('.sidebar__source-lang')).toBeNull()
    expect(container.querySelector('.sidebar__source-desc')).toBeNull()
  })

  it('shows a checkmark and the selected modifier when selected', () => {
    const { container } = render(<SourceItem name="org/app" selected />)

    expect(container.querySelector('.sidebar__source-check').textContent).toBe('✓')
    expect(container.querySelector('li')).toHaveClass('sidebar__source--selected')
  })

  it('leaves the checkmark empty when not selected', () => {
    const { container } = render(<SourceItem name="org/app" selected={false} />)

    expect(container.querySelector('.sidebar__source-check').textContent).toBe('')
    expect(container.querySelector('li')).not.toHaveClass('sidebar__source--selected')
  })

  it('applies the modifier it is given without leaving empty class slots', () => {
    const { container } = render(<SourceItem name="YOLO (auto)" selected={false} modifier="sidebar__source--yolo" />)

    expect(container.querySelector('li').className).toBe('sidebar__source sidebar__source--yolo')
  })

  it('reports a click', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<SourceItem name="org/app" selected={false} onToggle={onToggle} />)

    await user.click(screen.getByText('org/app'))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
