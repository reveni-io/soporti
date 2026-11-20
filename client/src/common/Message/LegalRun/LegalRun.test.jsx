import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
    expect(first).toHaveTextContent('Check it, copy it, send it from the ticket')
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
    expect(screen.getByText('Sending from Soporti isn’t available yet.')).toBeInTheDocument()
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
