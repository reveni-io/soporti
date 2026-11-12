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

  it('renders only the name when the language and description are missing', () => {
    render(<SourceItem name="org/bare" selected={false} />)

    expect(screen.getByRole('button')).toHaveTextContent(/^org\/bare$/)
  })

  it('renders the icon it is given', () => {
    render(<SourceItem name="Notion" icon={<svg data-testid="notion-icon" />} selected={false} />)

    expect(screen.getByTestId('notion-icon')).toBeInTheDocument()
  })

  it('is pressed when selected', () => {
    render(<SourceItem name="org/app" selected />)

    expect(screen.getByRole('button', { name: 'org/app' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is not pressed when not selected', () => {
    render(<SourceItem name="org/app" selected={false} />)

    expect(screen.getByRole('button', { name: 'org/app' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies the modifier it is given without leaving empty class slots', () => {
    render(<SourceItem name="YOLO (auto)" selected={false} modifier="source-item--yolo" />)

    expect(screen.getByRole('button').className).toBe('source-item source-item--yolo')
  })

  it('reports a click', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<SourceItem name="org/app" selected={false} onToggle={onToggle} />)

    await user.click(screen.getByText('org/app'))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('toggles from the keyboard', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<SourceItem name="org/app" selected={false} onToggle={onToggle} />)

    await user.tab()
    await user.keyboard('{Enter}')

    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
