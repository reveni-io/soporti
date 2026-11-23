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
    expect(first).toHaveTextContent('Check it, then ask Soporti to send it')
    expect(second).toHaveTextContent('HubSpot ticket 9312')
    expect(second).toHaveTextContent('unknown')
    expect(second).toHaveTextContent('Careful · 2 warnings')
    expect(second).toHaveTextContent('Read the warnings, then decide')
    expect(third).toHaveTextContent('Not checked')
    expect(third).toHaveTextContent('Check it yourself, then decide')
  })

  it('shows what the customer asks, what the data shows and the draft, with nothing to click: the chat decides', () => {
    render(<LegalRun cases={[legalCase()]} />)

    expect(screen.getByRole('link', { name: 'Zendesk ticket 48213' })).toHaveAttribute(
      'href',
      'https://acme.zendesk.com/agent/tickets/48213'
    )
    expect(screen.getByText('Where is my refund?')).toBeInTheDocument()
    expect(screen.getByText('Refund of 49.90 EUR issued on 15 Nov')).toBeInTheDocument()
    expect(screen.getByText('Hello, we issued your refund.')).toBeInTheDocument()
    expect(screen.getByText(/Ask Soporti in the chat to send it/)).toBeInTheDocument()
    expect(screen.getByText(/This run is older than sending from Soporti/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('marks each answer that should make Legal careful, with the confidence that was too low', () => {
    render(<LegalRun cases={[CAREFUL]} />)

    expect(screen.getByText('Legal guard · set v7')).toBeInTheDocument()
    expect(screen.getByText('58 < 70')).toBeInTheDocument()
    expect(screen.getByText('no answer')).toBeInTheDocument()
    expect(screen.getAllByText('Careful')).toHaveLength(2)
  })

  it('shows the review of every guard that checked the reply', () => {
    const reviewed = legalCase({
      guard: 'Legal + Legal Review',
      warnings: 2,
      reviews: [
        { guard: 'Legal', warnings: 2, reason: null, review: { setVersion: 7, minConfidence: 0.7, rows: ROWS } },
        { guard: 'Legal Review', warnings: 0, reason: 'the review could not run', review: null },
      ],
    })

    render(<LegalRun cases={[reviewed]} />)

    expect(screen.getByText('Legal guard · set v7')).toBeInTheDocument()
    expect(screen.getByText('Not reviewed: the review could not run.')).toBeInTheDocument()
  })

  it('explains a case without a draft or a check', () => {
    render(<LegalRun cases={[UNCHECKED]} />)

    expect(screen.getByText('No data was gathered.')).toBeInTheDocument()
    expect(screen.getByText('No draft: Draft failed (the agent could not finish it).')).toBeInTheDocument()
    expect(screen.getByText('Not reviewed: Draft failed (the agent could not finish it).')).toBeInTheDocument()
  })
})

describe('the state of each case', () => {
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

  it('sums up the run only when it has more than one case, with the sent ones', async () => {
    mockLegalApi({
      routes: {
        'GET /api/legal/cases?ids=41,42': [
          respond(200, {
            cases: [
              {
                id: 41,
                replies: [{ id: 7, sentBy: 'ana@example.com', text: 'Hi', sentAt: SENT_AT }],
                send: { allowed: true },
              },
              { id: 42, replies: [], send: { allowed: true } },
            ],
          }),
        ],
      },
    })

    const { unmount } = render(
      <LegalRun cases={[legalCase({ id: 41 }), legalCase({ id: 42, ticketId: '48214' })]} token="tok" />
    )

    const summary = screen.getAllByRole('table')[0]
    await waitFor(() => expect(within(summary).getAllByRole('row')[1]).toHaveTextContent('Sent'))
    expect(screen.getByRole('heading', { name: /^1\. Zendesk ticket 48213/ })).toBeInTheDocument()
    unmount()

    mockLegalApi()
    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)

    expect(screen.getByRole('heading', { name: /^Zendesk ticket 48213/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Next step' })).not.toBeInTheDocument()
  })

  it('says who sent the reply and when, or why Soporti cannot send it', async () => {
    mockLegalApi({ replies: [{ id: 7, sentBy: 'ana@example.com', text: 'Hi', sentAt: SENT_AT }] })

    const { unmount } = render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)

    expect(await screen.findByText(/^Sent by ana@example.com · /)).toBeInTheDocument()
    unmount()

    mockLegalApi({ send: { allowed: false, reason: 'Sending from Soporti is off.' } })
    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)

    expect(await screen.findByText('Sending from Soporti is off.')).toBeInTheDocument()
  })

  it('shows the ticket conversation, to read only', async () => {
    const messages = [{ id: '1', author: '', fromCustomer: true, at: SENT_AT, text: 'Any news on my refund?' }]
    mockLegalApi({ routes: { 'GET /api/legal/cases/41/conversation': [respond(200, { messages })] } })
    const user = userEvent.setup()

    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)
    await user.click(await screen.findByRole('button', { name: 'Show the ticket conversation' }))

    expect(await screen.findByText('Any news on my refund?')).toBeInTheDocument()
    expect(screen.getByText(/^Customer · /)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
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

    mockLegalApi({ routes: { 'GET /api/legal/cases/41/conversation': [respond(401, { error: 'Session expired' })] } })
    const user = userEvent.setup()
    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" onLogout={onLogout} />)

    await user.click(await screen.findByRole('button', { name: 'Show the ticket conversation' }))
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument()
  })

  it('tells when the state of the cases could not be loaded', async () => {
    global.fetch = vi.fn(async () => respond(500, { error: 'Failed to load the cases.' }))

    render(<LegalRun cases={[legalCase({ id: 41 })]} token="tok" />)

    expect(await screen.findByText('Failed to load the cases.')).toBeInTheDocument()
  })
})
