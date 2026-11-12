import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AskBar from './AskBar.jsx'

function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })

  return { promise, resolve }
}

describe('AskBar', () => {
  it('asks for the chart with the trimmed prompt when the button is pressed', async () => {
    const onAsk = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(<AskBar onAsk={onAsk} disabled={false} />)

    await user.type(screen.getByRole('textbox', { name: 'Describe the chart you want' }), '  Orders per week  ')
    await user.click(screen.getByRole('button', { name: 'Create chart' }))

    expect(onAsk).toHaveBeenCalledTimes(1)
    expect(onAsk).toHaveBeenCalledWith('Orders per week')
  })

  it('asks for the chart when Enter is pressed', async () => {
    const onAsk = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(<AskBar onAsk={onAsk} disabled={false} />)

    await user.type(screen.getByRole('textbox', { name: 'Describe the chart you want' }), 'Orders per week{Enter}')

    expect(onAsk).toHaveBeenCalledTimes(1)
    expect(onAsk).toHaveBeenCalledWith('Orders per week')
  })

  it('inserts a new line instead of asking when Shift+Enter is pressed', async () => {
    const onAsk = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(<AskBar onAsk={onAsk} disabled={false} />)
    const input = screen.getByRole('textbox', { name: 'Describe the chart you want' })

    await user.type(input, 'Orders per week{Shift>}{Enter}{/Shift}by country')

    expect(onAsk).not.toHaveBeenCalled()
    expect(input).toHaveValue('Orders per week\nby country')
  })

  it('keeps the button disabled while there is nothing to ask', async () => {
    const onAsk = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    render(<AskBar onAsk={onAsk} disabled={false} />)
    const input = screen.getByRole('textbox', { name: 'Describe the chart you want' })

    expect(screen.getByRole('button', { name: 'Create chart' })).toBeDisabled()

    await user.type(input, '   {Enter}')
    expect(onAsk).not.toHaveBeenCalled()

    await user.type(input, 'Signups per day')
    expect(screen.getByRole('button', { name: 'Create chart' })).toBeEnabled()
  })

  it('cannot be used while it is disabled', () => {
    render(<AskBar onAsk={vi.fn()} disabled />)

    expect(screen.getByRole('textbox', { name: 'Describe the chart you want' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create chart' })).toBeDisabled()
  })

  it('limits the prompt to the length the server accepts', () => {
    render(<AskBar onAsk={vi.fn()} disabled={false} />)

    expect(screen.getByRole('textbox', { name: 'Describe the chart you want' })).toHaveAttribute('maxlength', '2000')
    expect(screen.getByPlaceholderText('Describe the chart you want…')).toBeInTheDocument()
  })

  it('does not ask twice while the chart is being created and clears once it is', async () => {
    const creation = deferred()
    const onAsk = vi.fn().mockReturnValue(creation.promise)
    const user = userEvent.setup()
    render(<AskBar onAsk={onAsk} disabled={false} />)
    const input = screen.getByRole('textbox', { name: 'Describe the chart you want' })

    await user.type(input, 'Orders per week{Enter}')

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(input).toHaveValue('Orders per week')

    await user.keyboard('{Enter}')
    expect(onAsk).toHaveBeenCalledTimes(1)

    await act(async () => creation.resolve())

    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Create chart' })).toBeDisabled()
  })

  it('keeps what was typed while the chart was being created', async () => {
    const creation = deferred()
    const onAsk = vi.fn().mockReturnValue(creation.promise)
    const user = userEvent.setup()
    render(<AskBar onAsk={onAsk} disabled={false} />)
    const input = screen.getByRole('textbox', { name: 'Describe the chart you want' })

    await user.type(input, 'Orders per week{Enter}')
    await user.type(input, 'Top customers')
    await act(async () => creation.resolve())

    expect(input).toHaveValue('Top customers')
    expect(onAsk).toHaveBeenCalledTimes(1)
    expect(onAsk).toHaveBeenCalledWith('Orders per week')
  })

  it('keeps the text and shows the error when the chart cannot be created', async () => {
    const onAsk = vi.fn().mockRejectedValue(new Error('Describe the chart in at most 2000 characters.'))
    const user = userEvent.setup()
    render(<AskBar onAsk={onAsk} disabled={false} />)
    const input = screen.getByRole('textbox', { name: 'Describe the chart you want' })

    await user.type(input, 'Orders per week{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Describe the chart in at most 2000 characters.')
    expect(input).toHaveValue('Orders per week')
    expect(screen.getByRole('button', { name: 'Create chart' })).toBeEnabled()
  })

  it('clears the error on the next attempt', async () => {
    const onAsk = vi.fn().mockRejectedValueOnce(new Error('Failed to create the chart')).mockResolvedValueOnce()
    const user = userEvent.setup()
    render(<AskBar onAsk={onAsk} disabled={false} />)
    const input = screen.getByRole('textbox', { name: 'Describe the chart you want' })

    await user.type(input, 'Orders per week{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to create the chart')

    await user.click(screen.getByRole('button', { name: 'Create chart' }))

    expect(screen.queryByRole('alert')).toBeNull()
    expect(onAsk).toHaveBeenCalledTimes(2)
  })

  it('lets the page fill it with a prompt and takes the focus without asking', () => {
    const onAsk = vi.fn()
    const ref = createRef()
    render(<AskBar ref={ref} onAsk={onAsk} disabled={false} />)
    const input = screen.getByRole('textbox', { name: 'Describe the chart you want' })

    act(() => ref.current.fill('Top 10 customers by revenue this year'))

    expect(input).toHaveValue('Top 10 customers by revenue this year')
    expect(input).toHaveFocus()
    expect(onAsk).not.toHaveBeenCalled()
  })
})
