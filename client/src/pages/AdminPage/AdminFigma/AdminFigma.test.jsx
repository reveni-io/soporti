import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminFigma from './AdminFigma.jsx'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockGet({ tokenConfigured = false, commentsEnabled = false } = {}) {
  return { ok: true, status: 200, json: async () => ({ tokenConfigured, commentsEnabled }) }
}

describe('AdminFigma', () => {
  it('shows the token status as configured', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenConfigured: true }))

    render(<AdminFigma token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/config/figma')
  })

  it('shows not configured when there is no token', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet())

    render(<AdminFigma token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('saves a new token and clears the input (write-only)', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenConfigured: true }) })
    const user = userEvent.setup()

    render(<AdminFigma token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    const input = screen.getByPlaceholderText('figd_...')
    await user.type(input, 'figd_newtoken')
    await user.click(screen.getByRole('button', { name: /save token/i }))

    expect(await screen.findByText('configured')).toBeInTheDocument()
    expect(input).toHaveValue('')
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/figma/token')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ token: 'figd_newtoken' })
  })

  it('removes the token', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ tokenConfigured: false }) })
    const user = userEvent.setup()

    render(<AdminFigma token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(await screen.findByText('not configured')).toBeInTheDocument()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ token: '' })
  })

  it('surfaces a token validation error from the server', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet())
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'That does not look like a valid Figma personal access token.' }),
      })
    const user = userEvent.setup()

    render(<AdminFigma token="tok" onLogout={vi.fn()} />)
    await screen.findByText('not configured')

    await user.type(screen.getByPlaceholderText('figd_...'), 'bad')
    await user.click(screen.getByRole('button', { name: /save token/i }))

    expect(await screen.findByText('That does not look like a valid Figma personal access token.')).toBeInTheDocument()
  })

  it('saves the comment switch through the Figma comments endpoint and reflects the answer', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockGet({ tokenConfigured: true }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ commentsEnabled: true }) })
    const user = userEvent.setup()

    render(<AdminFigma token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    const toggle = screen.getByRole('checkbox', { name: /post comments on designs/i })
    expect(toggle).not.toBeChecked()

    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(toggle).toBeChecked()
    const [url, options] = global.fetch.mock.calls[1]
    expect(url).toContain('/api/admin/config/figma/comments')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ enabled: true })
  })

  it('shows the comment switch already on', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockGet({ tokenConfigured: true, commentsEnabled: true }))

    render(<AdminFigma token="tok" onLogout={vi.fn()} />)
    await screen.findByText('configured')

    expect(screen.getByRole('checkbox', { name: /post comments on designs/i })).toBeChecked()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminFigma token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
