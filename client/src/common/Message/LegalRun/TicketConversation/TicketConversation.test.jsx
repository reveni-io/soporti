import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TicketConversation from './TicketConversation.jsx'

const AT = '2026-11-20T10:00:00.000Z'
const CUSTOMER = { id: '1', author: '', fromCustomer: true, at: AT, text: 'Any news on my refund?' }
const AGENT = { id: '2', author: '', fromCustomer: false, at: AT, text: 'It is on its way.' }
const LEGAL_CASE = { id: 41, customer: 'customer-a@example.com' }

function respond(status, body) {
  return { ok: status < 400, status, json: async () => body }
}

function mockApi(routes) {
  global.fetch = vi.fn(async (url, options = {}) => {
    const key = `${options.method ?? 'GET'} ${new URL(url, 'http://localhost').pathname}`
    const responses = routes[key]
    if (!responses) throw new Error(`Unexpected request: ${key}`)
    return responses.length > 1 ? responses.shift() : responses[0]
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TicketConversation', () => {
  it('shows the customer and agent messages once asked', async () => {
    mockApi({ 'GET /api/legal/cases/41/conversation': [respond(200, { messages: [CUSTOMER, AGENT] })] })
    const user = userEvent.setup()
    render(<TicketConversation token="tok" legalCase={LEGAL_CASE} onLogout={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Show the ticket conversation' }))

    expect(await screen.findByText('Any news on my refund?')).toBeInTheDocument()
    expect(screen.getByText(/^Customer · /)).toBeInTheDocument()
    expect(screen.getByText(/^Agent · /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })

  it('warns when a long ticket was cut short', async () => {
    mockApi({
      'GET /api/legal/cases/41/conversation': [
        respond(200, { messages: [CUSTOMER], notice: 'This ticket is long: only its first messages are shown here.' }),
      ],
    })
    const user = userEvent.setup()
    render(<TicketConversation token="tok" legalCase={LEGAL_CASE} onLogout={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Show the ticket conversation' }))

    expect(await screen.findByText('This ticket is long: only its first messages are shown here.')).toBeInTheDocument()
  })

  it('says when the ticket has no public messages, and why it could not be read', async () => {
    mockApi({
      'GET /api/legal/cases/41/conversation': [
        respond(502, { error: 'Could not read the Zendesk ticket.' }),
        respond(200, { messages: [] }),
      ],
    })
    const user = userEvent.setup()
    render(<TicketConversation token="tok" legalCase={LEGAL_CASE} onLogout={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Show the ticket conversation' }))
    expect(await screen.findByText('Could not read the Zendesk ticket.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show the ticket conversation' }))
    expect(await screen.findByText('The ticket has no public messages yet.')).toBeInTheDocument()
  })

  it('logs out when the session expired', async () => {
    mockApi({ 'GET /api/legal/cases/41/conversation': [respond(401, { error: 'Session expired' })] })
    const user = userEvent.setup()
    const onLogout = vi.fn()
    render(<TicketConversation token="tok" legalCase={LEGAL_CASE} onLogout={onLogout} />)

    await user.click(screen.getByRole('button', { name: 'Show the ticket conversation' }))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument()
  })
})
