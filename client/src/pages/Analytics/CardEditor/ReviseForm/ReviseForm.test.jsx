import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReviseForm from './ReviseForm.jsx'

describe('ReviseForm', () => {
  it('explains what asking does', () => {
    render(<ReviseForm isSending={false} error={null} onAsk={vi.fn()} />)

    expect(screen.getByPlaceholderText('e.g. make it monthly, only the top 5…')).toBeInTheDocument()
    expect(screen.getByText('The assistant rewrites the saved query. Unsaved edits are discarded.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Ask for a change' })).toHaveAttribute('maxlength', '2000')
  })

  it('asks for the trimmed change from the button', async () => {
    const onAsk = vi.fn()
    const user = userEvent.setup()
    render(<ReviseForm isSending={false} error={null} onAsk={onAsk} />)

    await user.type(screen.getByRole('textbox', { name: 'Ask for a change' }), '  make it monthly ')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(onAsk).toHaveBeenCalledTimes(1)
    expect(onAsk).toHaveBeenCalledWith('make it monthly')
  })

  it('asks for the change on Enter', async () => {
    const onAsk = vi.fn()
    const user = userEvent.setup()
    render(<ReviseForm isSending={false} error={null} onAsk={onAsk} />)

    await user.type(screen.getByRole('textbox', { name: 'Ask for a change' }), 'only the top 5{Enter}')

    expect(onAsk).toHaveBeenCalledTimes(1)
    expect(onAsk).toHaveBeenCalledWith('only the top 5')
  })

  it('does not ask for nothing', async () => {
    const onAsk = vi.fn()
    const user = userEvent.setup()
    render(<ReviseForm isSending={false} error={null} onAsk={onAsk} />)

    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Ask for a change' }), '   {Enter}')

    expect(onAsk).not.toHaveBeenCalled()
  })

  it('does not ask twice while the request is on its way', async () => {
    const onAsk = vi.fn()
    const user = userEvent.setup()
    render(<ReviseForm isSending error={null} onAsk={onAsk} />)

    await user.type(screen.getByRole('textbox', { name: 'Ask for a change' }), 'only the top 5{Enter}')

    expect(screen.getByRole('button', { name: 'Asking…' })).toBeDisabled()
    expect(onAsk).not.toHaveBeenCalled()
  })

  it('shows why the change could not be requested', () => {
    render(<ReviseForm isSending={false} error="The chart is already being generated." onAsk={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('The chart is already being generated.')
  })
})
