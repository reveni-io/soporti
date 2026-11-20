import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LegalRun from './LegalRun.jsx'

const ROWS = [
  {
    questionId: 'l1',
    question: 'Is the customer asking for something unusual?',
    answer: 'Yes',
    confidence: 0.94,
    flagged: true,
    unsure: false,
  },
  {
    questionId: 'l2',
    question: 'Does the request match the data?',
    answer: 'No',
    confidence: 0.58,
    flagged: false,
    unsure: true,
  },
  {
    questionId: 'l3',
    question: 'Does the reply promise too much?',
    answer: null,
    confidence: 0.9,
    flagged: false,
    unsure: false,
  },
]

function legalCase(overrides = {}) {
  return {
    source: 'zendesk',
    ticketId: '48213',
    ticketUrl: 'https://acme.zendesk.com/agent/tickets/48213',
    customer: 'customer-a@example.com',
    subject: 'Refund for order A-10234',
    customerMessage: 'Where is my refund?',
    dataFacts: [{ fact: 'Refund of 49.90 EUR issued on 15 Nov', source: 'database' }],
    draft: { subject: 'Your refund for order A-10234', body: 'Hello, we issued your refund.' },
    language: 'en',
    status: 'checked',
    reason: null,
    warnings: 0,
    review: { setVersion: 7, minConfidence: 0.7, rows: [] },
    ...overrides,
  }
}

const CAREFUL = legalCase({
  source: 'hubspot',
  ticketId: '9312',
  ticketUrl: null,
  customer: '',
  subject: '',
  warnings: 2,
  review: { setVersion: 7, minConfidence: 0.7, rows: ROWS },
})
const UNCHECKED = legalCase({
  ticketId: '48240',
  dataFacts: [],
  draft: null,
  status: 'not_checked',
  reason: 'Draft failed (the agent could not finish it)',
  review: null,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LegalRun', () => {
  it('sums up every case with its warnings and the next step', () => {
    render(<LegalRun cases={[legalCase(), CAREFUL, UNCHECKED]} />)

    const [, first, second, third] = within(screen.getAllByRole('table')[0]).getAllByRole('row')
    expect(first).toHaveTextContent('Zendesk ticket 48213')
    expect(first).toHaveTextContent('No warnings')
    expect(first).toHaveTextContent('Check it, then send it')
    expect(second).toHaveTextContent('HubSpot ticket 9312')
    expect(second).toHaveTextContent('unknown')
    expect(second).toHaveTextContent('Careful · 2 warnings')
    expect(second).toHaveTextContent('Read the warnings, then decide')
    expect(third).toHaveTextContent('Not checked')
    expect(third).toHaveTextContent('Check it yourself, then decide')
  })

  it('shows what the customer asks, what the data shows and the draft to edit', () => {
    render(<LegalRun cases={[legalCase()]} />)

    expect(screen.getByRole('link', { name: 'Zendesk ticket 48213' })).toHaveAttribute(
      'href',
      'https://acme.zendesk.com/agent/tickets/48213'
    )
    expect(screen.getByText('Where is my refund?')).toBeInTheDocument()
    expect(screen.getByText('Refund of 49.90 EUR issued on 15 Nov')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Hello, we issued your refund.')
    expect(screen.getByRole('button', { name: 'Copy reply' })).toHaveClass('btn--primary')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByText(/This run is older than sending from Soporti/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('marks each answer that should make Legal careful, with the confidence that was too low', () => {
    render(<LegalRun cases={[CAREFUL]} />)

    expect(screen.getByText('Legal review · set v7')).toBeInTheDocument()
    expect(screen.getByText('0.58 < 0.70')).toBeInTheDocument()
    expect(screen.getByText('no answer')).toBeInTheDocument()
    expect(screen.getAllByText('Careful')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Copy reply' })).toHaveClass('btn--secondary')
  })

  it('explains a case without a draft or a check', () => {
    render(<LegalRun cases={[UNCHECKED]} />)

    expect(screen.getByText('No data was gathered.')).toBeInTheDocument()
    expect(screen.getByText('No draft: Draft failed (the agent could not finish it).')).toBeInTheDocument()
    expect(screen.getByText('Not reviewed: Draft failed (the agent could not finish it).')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy reply' })).toBeDisabled()
  })

  it('copies the edited reply', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()

    render(<LegalRun cases={[legalCase()]} />)
    await user.type(screen.getByRole('textbox'), ' Thanks.')
    await user.click(screen.getByRole('button', { name: 'Copy reply' }))

    expect(writeText).toHaveBeenCalledWith('Hello, we issued your refund. Thanks.')
    expect(await screen.findByText('Copied. Paste it in the ticket.')).toBeInTheDocument()
  })

  it('selects the reply to copy by hand when the clipboard fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))

    render(<LegalRun cases={[legalCase()]} />)
    const reply = screen.getByRole('textbox')
    const select = vi.spyOn(reply, 'select')
    await user.click(screen.getByRole('button', { name: 'Copy reply' }))

    expect(await screen.findByText('Select the text and copy it with Ctrl+C.')).toBeInTheDocument()
    expect(select).toHaveBeenCalledTimes(1)
  })
})

describe('sending from Soporti', () => {
  const SENT_AT = '2026-11-20T10:00:00.000Z'

  function respond(status, body) {
    return { ok: status < 400, status, json: async () => body }
  }

  function mockLegalApi({ send = { allowed: true, reason: null }, replies = [], routes = {} } = {}) {
    const handlers = {
      'GET /api/legal/cases?ids=41': [respond(200, { cases: [{ id: 41, replies, send }] })],
      ...routes,
    }
    global.fetch = vi.fn(async (url, options = {}) => {
      const key = `${options.method ?? 'GET'} ${new URL(url, 'http://localhost').pathname}${new URL(url, 'http://localhost').search}`
      const responses = handlers[key]
      if (!responses) throw new Error(`Unexpected request: ${key}`)
      return responses.length > 1 ? responses.shift() : responses[0]
    })
  }

  function sentReply(text) {
    return respond(201, { reply: { id: 7, sentBy: 'ana@example.com', text, sentAt: SENT_AT } })
  }

  function bodyOf(method, path) {
    const call = global.fetch.mock.calls.find(
      ([url, options = {}]) => (options.method ?? 'GET') === method && url.endsWith(path)
    )
    return JSON.parse(call[1].body)
  }

  it('sends the edited draft as the user after confirming it', async () => {
    mockLegalApi({
      routes: { 'POST /api/legal/cases/41/replies': [sentReply('Hello, we issued your refund. Thanks.')] },
    })
    const user = userEvent.setup()

    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)
    const send = await screen.findByRole('button', { name: 'Send' })
    await waitFor(() => expect(send).toBeEnabled())
    await user.type(screen.getByRole('textbox'), ' Thanks.')
    await user.click(send)

    const confirm = screen.getByRole('group', { name: 'Confirm the reply' })
    expect(send).toBeDisabled()
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
    expect(confirm).toHaveTextContent('Send this reply to customer-a@example.com on Zendesk ticket 48213?')
    expect(confirm).toHaveTextContent('You edited the reply after the review')
    await user.click(within(confirm).getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText(/^Sent by ana@example\.com · /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sent' })).toBeDisabled()
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
    expect(within(screen.getAllByRole('table')[0]).getAllByRole('row')[1]).toHaveTextContent('Sent')
    expect(bodyOf('POST', '/api/legal/cases/41/replies')).toEqual({
      text: 'Hello, we issued your refund. Thanks.',
      warningsRead: false,
    })
  })

  it('asks to confirm the warnings of a case that needs care', async () => {
    mockLegalApi({ routes: { 'POST /api/legal/cases/41/replies': [sentReply('Hello')] } })
    const user = userEvent.setup()

    render(<LegalRun cases={[legalCase({ id: 41, warnings: 2 })]} token="tok" />)
    const send = await screen.findByRole('button', { name: 'Send' })
    await waitFor(() => expect(send).toBeEnabled())
    await user.click(send)

    const sendReply = screen.getByRole('button', { name: 'Send reply' })
    expect(sendReply).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'I read the warnings of this case' }))
    await user.click(sendReply)

    expect(await screen.findByText(/^Sent by ana@example\.com/)).toBeInTheDocument()
    expect(bodyOf('POST', '/api/legal/cases/41/replies').warningsRead).toBe(true)
  })

  it('shows a reply that went out but was not recorded as sent, so it is not offered again', async () => {
    const warning = 'The reply was sent, but Soporti could not record it. Check the ticket before sending it again.'
    mockLegalApi({
      routes: {
        'POST /api/legal/cases/41/replies': [
          respond(201, { reply: { id: null, sentBy: 'ana@example.com', text: 'Hello', sentAt: SENT_AT }, warning }),
        ],
      },
    })
    const user = userEvent.setup()

    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)
    const send = await screen.findByRole('button', { name: 'Send' })
    await waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText(warning)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sent' })).toBeDisabled()
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Send reply' })).not.toBeInTheDocument()
  })

  it('shows why the reply cannot be sent, and why a send failed', async () => {
    mockLegalApi({ send: { allowed: false, reason: 'Sending from Soporti is off.' } })

    const { unmount } = render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)

    expect(await screen.findByText('Sending from Soporti is off.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    unmount()

    mockLegalApi({
      routes: { 'POST /api/legal/cases/41/replies': [respond(502, { error: 'Zendesk did not take the reply.' })] },
    })
    const user = userEvent.setup()
    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)
    const send = await screen.findByRole('button', { name: 'Send' })
    await waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText('Zendesk did not take the reply.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Confirm the reply' })).not.toBeInTheDocument()
  })

  it('shows the ticket conversation and sends a follow-up from it', async () => {
    const before = [{ id: '1', author: '', fromCustomer: true, at: SENT_AT, text: 'Any news on my refund?' }]
    const after = [...before, { id: '2', author: 'Ana', fromCustomer: false, at: SENT_AT, text: 'It is on its way.' }]
    mockLegalApi({
      replies: [{ id: 6, sentBy: 'ana@example.com', text: 'Hello', sentAt: SENT_AT }],
      routes: {
        'GET /api/legal/cases/41/conversation': [respond(200, { messages: before }), respond(200, { messages: after })],
        'POST /api/legal/cases/41/replies': [sentReply('It is on its way.')],
      },
    })
    const user = userEvent.setup()

    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)
    await user.click(await screen.findByRole('button', { name: 'Show the ticket conversation' }))

    expect(await screen.findByText('Any news on my refund?')).toBeInTheDocument()
    expect(screen.getByText(/^Customer · /)).toBeInTheDocument()
    const followUp = screen.getAllByRole('textbox').at(-1)
    await user.type(followUp, 'It is on its way.')
    await user.click(screen.getAllByRole('button', { name: 'Send' }).at(-1))
    expect(followUp).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText(/^Ana · /)).toBeInTheDocument()
    expect(followUp).toHaveValue('')
  })

  it('shows an empty conversation and why it could not be read', async () => {
    mockLegalApi({
      routes: {
        'GET /api/legal/cases/41/conversation': [
          respond(502, { error: 'Could not read the Zendesk ticket.' }),
          respond(200, { messages: [] }),
        ],
      },
    })
    const user = userEvent.setup()

    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)
    await user.click(await screen.findByRole('button', { name: 'Show the ticket conversation' }))
    expect(await screen.findByText('Could not read the Zendesk ticket.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show the ticket conversation' }))
    expect(await screen.findByText('The ticket has no public messages yet.')).toBeInTheDocument()
  })

  it('logs out instead of showing an error when the session expired', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn(async () => respond(401, { error: 'Session expired' }))

    const { unmount } = render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" onLogout={onLogout} />)

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    unmount()

    mockLegalApi({
      routes: {
        'POST /api/legal/cases/41/replies': [respond(401, { error: 'Session expired' })],
        'GET /api/legal/cases/41/conversation': [respond(401, { error: 'Session expired' })],
      },
    })
    const user = userEvent.setup()
    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" onLogout={onLogout} />)
    const send = await screen.findByRole('button', { name: 'Send' })
    await waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    await user.click(screen.getByRole('button', { name: 'Send reply' }))
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(2))

    await user.click(screen.getByRole('button', { name: 'Show the ticket conversation' }))
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(3))
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument()
  })

  it('tells when the state of the cases could not be loaded', async () => {
    global.fetch = vi.fn(async () => respond(500, { error: 'Failed to load the cases.' }))

    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)

    expect(await screen.findByText('Failed to load the cases.')).toBeInTheDocument()
  })
})
