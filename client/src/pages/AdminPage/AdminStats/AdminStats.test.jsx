import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminStats from './AdminStats.jsx'

const sampleStats = {
  days: null,
  conversations: 128,
  activeUsers: 9,
  conversationsBySource: [
    { source: 'web', conversations: 100 },
    { source: 'slack', conversations: 28 },
  ],
  messages: 640,
  userMessages: 320,
  reviewedPullRequests: 42,
  diagnosedTickets: 17,
  runs: {
    runs: 500,
    failedRuns: 3,
    requests: 1200,
    inputTokens: 2_400_000,
    outputTokens: 96_000,
    cachedInputTokens: 1_800_000,
    cacheWriteTokens: 12_000,
    p50DurationMs: 4200,
    p95DurationMs: 15_800,
  },
  byChannel: [
    {
      channel: 'web',
      runs: 300,
      failedRuns: 2,
      inputTokens: 1_000_000,
      outputTokens: 50_000,
      p50DurationMs: 3000,
      p95DurationMs: 9000,
    },
    {
      channel: 'pr_review',
      runs: 60,
      failedRuns: 0,
      inputTokens: 1_400_000,
      outputTokens: 46_000,
      p50DurationMs: 30_000,
      p95DurationMs: 60_000,
    },
  ],
  tools: [
    { tool: 'get_file_contents', calls: 900 },
    { tool: 'query_database', calls: 120 },
  ],
}

function okResponse(stats) {
  return { ok: true, status: 200, json: async () => ({ stats }) }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('AdminStats', () => {
  it('renders the headline counters for all time', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse(sampleStats))

    render(<AdminStats token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('128')).toBeInTheDocument()
    expect(screen.getByText('Conversations')).toBeInTheDocument()
    expect(screen.getByText('100 Web · 28 Slack')).toBeInTheDocument()
    expect(screen.getByText('640')).toBeInTheDocument()
    expect(screen.getByText('320 asked')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toContain('/api/admin/stats?days=all')
  })

  it('formats tokens, cache hit rate and latency', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse(sampleStats))

    render(<AdminStats token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('2.4M')).toBeInTheDocument()
    expect(screen.getByText('96K')).toBeInTheDocument()
    expect(screen.getByText('1.8M')).toBeInTheDocument()
    expect(screen.getByText('75% of input')).toBeInTheDocument()
    expect(screen.getByText('4.2s')).toBeInTheDocument()
    expect(screen.getByText('p95 15.8s')).toBeInTheDocument()
    expect(screen.getByText('3 failed')).toBeInTheDocument()
  })

  it('breaks the runs down by channel and lists the most used tools', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse(sampleStats))

    render(<AdminStats token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Web chat')).toBeInTheDocument()
    expect(screen.getByText('PR reviews')).toBeInTheDocument()
    expect(screen.getByText('get_file_contents')).toBeInTheDocument()
    expect(screen.getByText('900')).toBeInTheDocument()
  })

  it('reloads with the selected range', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(okResponse(sampleStats))
      .mockResolvedValueOnce(okResponse({ ...sampleStats, days: 7, conversations: 6 }))
    const user = userEvent.setup()

    render(<AdminStats token="tok" onLogout={vi.fn()} />)
    await screen.findByText('128')

    await user.click(screen.getByRole('button', { name: '7 days' }))

    expect(await screen.findByText('6')).toBeInTheDocument()
    expect(global.fetch.mock.calls[1][0]).toContain('/api/admin/stats?days=7')
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the empty states when nothing has run yet', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okResponse({
        ...sampleStats,
        conversationsBySource: [],
        byChannel: [],
        tools: [],
        runs: {
          ...sampleStats.runs,
          runs: 0,
          failedRuns: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          p50DurationMs: 0,
          p95DurationMs: 0,
        },
      })
    )

    render(<AdminStats token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('No agent runs recorded yet.')).toBeInTheDocument()
    expect(screen.getByText('No tool calls recorded yet.')).toBeInTheDocument()
    expect(screen.getByText('none failed')).toBeInTheDocument()
    expect(screen.getByText('— of input')).toBeInTheDocument()
    expect(screen.getByText('p95 —')).toBeInTheDocument()
  })

  it('dashes the groups the server could not load and keeps the rest', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okResponse({
        ...sampleStats,
        runs: null,
        byChannel: null,
        tools: null,
      })
    )

    render(<AdminStats token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('128')).toBeInTheDocument()
    expect(screen.getByText('The channel breakdown is unavailable right now.')).toBeInTheDocument()
    expect(screen.getByText('The tool ranking is unavailable right now.')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(7)
    expect(screen.queryByText('none failed')).not.toBeInTheDocument()
  })

  it('shows the loading state instead of the previous error when the range changes', async () => {
    let resolveSecond
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Failed to load the stats.' }) })
      .mockReturnValueOnce(new Promise(resolve => (resolveSecond = resolve)))
    const user = userEvent.setup()

    render(<AdminStats token="tok" onLogout={vi.fn()} />)
    await screen.findByText('Failed to load the stats.')

    await user.click(screen.getByRole('button', { name: '7 days' }))

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load the stats.')).not.toBeInTheDocument()

    resolveSecond(okResponse(sampleStats))

    expect(await screen.findByText('128')).toBeInTheDocument()
  })

  it('renders the error instead of the numbers when the request fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Failed to load the stats.' }) })

    render(<AdminStats token="tok" onLogout={vi.fn()} />)

    expect(await screen.findByText('Failed to load the stats.')).toBeInTheDocument()
    expect(screen.queryByText('Conversations')).not.toBeInTheDocument()
  })

  it('logs out on a 401', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    render(<AdminStats token="expired" onLogout={onLogout} />)

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
