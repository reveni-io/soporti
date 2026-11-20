import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SendConfirm from './SendConfirm.jsx'

function renderConfirm(overrides = {}) {
  const props = {
    recipient: 'customer-a@example.com',
    label: 'Zendesk ticket 48213',
    needsCare: false,
    edited: false,
    sending: false,
    error: null,
    onCancel: vi.fn(),
    onSend: vi.fn(),
    ...overrides,
  }
  render(<SendConfirm {...props} />)
  return props
}

describe('SendConfirm', () => {
  it('asks to send the reply to the customer on the ticket', async () => {
    const user = userEvent.setup()
    const { onSend } = renderConfirm()

    expect(screen.getByRole('group', { name: 'Confirm the reply' })).toHaveTextContent(
      'Send this reply to customer-a@example.com on Zendesk ticket 48213? It goes out as you'
    )
    expect(screen.queryByText(/You edited the reply/)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(onSend).toHaveBeenCalledWith(false)
  })

  it('names the customer when the ticket has no address', () => {
    renderConfirm({ recipient: '' })

    expect(screen.getByText('the customer')).toBeInTheDocument()
  })

  it('says the review does not cover an edited reply', () => {
    renderConfirm({ edited: true })

    expect(
      screen.getByText('You edited the reply after the review: the review does not cover your changes.')
    ).toBeInTheDocument()
  })

  it('sends a case that needs care only once its warnings are read', async () => {
    const user = userEvent.setup()
    const { onSend } = renderConfirm({ needsCare: true })
    const send = screen.getByRole('button', { name: 'Send reply' })

    expect(send).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'I read the warnings of this case' }))
    await user.click(send)

    expect(onSend).toHaveBeenCalledWith(true)
  })

  it('cancels', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderConfirm()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('blocks both buttons while sending and shows why the last send failed', () => {
    renderConfirm({ sending: true, error: 'Zendesk did not take the reply.' })

    expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByText('Zendesk did not take the reply.')).toBeInTheDocument()
  })
})
