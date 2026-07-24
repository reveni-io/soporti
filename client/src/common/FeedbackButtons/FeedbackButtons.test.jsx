import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackButtons from './FeedbackButtons.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('FeedbackButtons', () => {
  it('renders both feedback buttons', () => {
    render(<FeedbackButtons feedbackId="fb-1" authToken="tok" />)
    expect(screen.getByTitle('Helpful')).toBeInTheDocument()
    expect(screen.getByTitle('Not helpful')).toBeInTheDocument()
  })

  it('sends positive feedback and shows Thanks!', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    const user = userEvent.setup()

    render(<FeedbackButtons feedbackId="fb-1" authToken="tok" />)
    await user.click(screen.getByTitle('Helpful'))

    expect(screen.getByText('Thanks!')).toBeInTheDocument()
    expect(screen.queryByTitle('Helpful')).not.toBeInTheDocument()

    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/feedback')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(options.body)).toEqual({ feedbackId: 'fb-1', useful: true })
  })

  it('sends negative feedback and shows Noted', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    const user = userEvent.setup()

    render(<FeedbackButtons feedbackId="fb-2" authToken="tok" />)
    await user.click(screen.getByTitle('Not helpful'))

    expect(screen.getByText('Noted')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ feedbackId: 'fb-2', useful: false })
  })

  it('still shows the confirmation when the request fails (best-effort)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'))
    const user = userEvent.setup()

    render(<FeedbackButtons feedbackId="fb-3" authToken="tok" />)
    await user.click(screen.getByTitle('Helpful'))

    expect(screen.getByText('Thanks!')).toBeInTheDocument()
  })
})
