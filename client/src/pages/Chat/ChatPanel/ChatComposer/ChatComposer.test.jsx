import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatComposer from './ChatComposer.jsx'

const BASE_PROPS = {
  input: '',
  textareaRef: { current: null },
  highlightRef: { current: null },
  commandPrefix: '',
  canSend: false,
  menuOpen: false,
  matchingSkills: [],
  menuIndex: 0,
  onChange: vi.fn(),
  onKeyDown: vi.fn(),
  onSubmit: vi.fn(),
  onSelectSkill: vi.fn(),
  onBlur: vi.fn(),
  onScroll: vi.fn(),
  isLoading: false,
  hasSourcesSelected: true,
  onStop: vi.fn(),
}

describe('ChatComposer', () => {
  it('invites a question when sources are selected', () => {
    render(<ChatComposer {...BASE_PROPS} />)

    expect(screen.getByPlaceholderText('Ask Soporti anything...')).toBeEnabled()
  })

  it('disables the textarea and asks for a source when none is selected', () => {
    render(<ChatComposer {...BASE_PROPS} hasSourcesSelected={false} />)

    expect(screen.getByPlaceholderText('Select a source from the sidebar first...')).toBeDisabled()
  })

  it('reports what the user types', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ChatComposer {...BASE_PROPS} onChange={onChange} />)

    await user.type(screen.getByPlaceholderText('Ask Soporti anything...'), 'h')

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('keeps Send disabled until the message can be sent', () => {
    const { rerender } = render(<ChatComposer {...BASE_PROPS} />)
    expect(screen.getByTitle('Send')).toBeDisabled()

    rerender(<ChatComposer {...BASE_PROPS} canSend />)
    expect(screen.getByTitle('Send')).toBeEnabled()
  })

  it('submits the form', async () => {
    const onSubmit = vi.fn(event => event.preventDefault())
    const user = userEvent.setup()
    render(<ChatComposer {...BASE_PROPS} canSend onSubmit={onSubmit} />)

    await user.click(screen.getByTitle('Send'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('swaps Send for Stop while a response is streaming', async () => {
    const onStop = vi.fn()
    const user = userEvent.setup()
    render(<ChatComposer {...BASE_PROPS} isLoading onStop={onStop} />)

    expect(screen.queryByTitle('Send')).not.toBeInTheDocument()
    await user.click(screen.getByTitle('Stop'))

    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('overlays the command prefix only when a skill is invoked', () => {
    const { container, rerender } = render(<ChatComposer {...BASE_PROPS} input="/trace-order 1024" />)
    expect(container.querySelector('.chat__input-highlight')).toBeNull()

    rerender(<ChatComposer {...BASE_PROPS} input="/trace-order 1024" commandPrefix="/trace-order" />)

    expect(container.querySelector('.chat__input-command').textContent).toBe('/trace-order')
    expect(container.querySelector('.chat__input-highlight').textContent).toBe('/trace-order 1024')
    expect(screen.getByPlaceholderText('Ask Soporti anything...')).toHaveClass('chat__input--overlaid')
  })

  it('shows the skill menu only while it is open', () => {
    const skills = [{ id: 1, name: 'trace-order' }]
    const { rerender } = render(<ChatComposer {...BASE_PROPS} matchingSkills={skills} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    rerender(<ChatComposer {...BASE_PROPS} menuOpen matchingSkills={skills} />)

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('/trace-order')).toBeInTheDocument()
  })
})
