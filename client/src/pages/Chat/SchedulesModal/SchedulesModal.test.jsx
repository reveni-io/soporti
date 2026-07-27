import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SchedulesModal from './SchedulesModal.jsx'

const DAILY = {
  id: 1,
  question: 'Which payments failed?',
  frequency: 'daily',
  hour: 9,
  minute: 0,
  weekday: null,
  monthDay: null,
  timezone: 'Europe/Madrid',
  nextRunAt: '2026-07-28T07:00:00.000Z',
  lastRunAt: '2026-07-27T07:00:00.000Z',
  lastStatus: 'ok',
  lastError: null,
}

function mockFetch(schedules, { deleteResponse } = {}) {
  return vi.fn().mockImplementation((_url, options = {}) => {
    if (options.method === 'DELETE') {
      return Promise.resolve(deleteResponse ?? { ok: true, status: 200, json: async () => ({ ok: true }) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ schedules }) })
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('SchedulesModal', () => {
  it('lists every schedule with its cadence and its runs', async () => {
    global.fetch = mockFetch([DAILY])

    render(
      <SchedulesModal
        token="tok"
        onClose={vi.fn()}
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
      />
    )

    expect(await screen.findByText('Which payments failed?')).toBeInTheDocument()
    expect(screen.getByText(/Daily at 09:00 · Europe\/Madrid/)).toBeInTheDocument()
    expect(screen.getByText(/Next run .* · Last run/)).toBeInTheDocument()
  })

  it('shows the empty state when there is no schedule', async () => {
    global.fetch = mockFetch([])

    render(
      <SchedulesModal
        token="tok"
        onClose={vi.fn()}
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
      />
    )

    expect(await screen.findByText('No scheduled queries yet.')).toBeInTheDocument()
  })

  it('surfaces the error of the last failed run', async () => {
    global.fetch = mockFetch([{ ...DAILY, lastStatus: 'error', lastError: 'model unavailable' }])

    render(
      <SchedulesModal
        token="tok"
        onClose={vi.fn()}
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
      />
    )

    expect(await screen.findByText(/Last run failed: model unavailable/)).toBeInTheDocument()
  })

  it('deletes a schedule after confirming and reloads the list', async () => {
    global.fetch = mockFetch([DAILY])
    const user = userEvent.setup()

    render(
      <SchedulesModal
        token="tok"
        onClose={vi.fn()}
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
      />
    )

    await user.click(await screen.findByRole('button', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      const deleteCall = global.fetch.mock.calls.find(([, options]) => options?.method === 'DELETE')
      expect(deleteCall[0]).toContain('/api/schedules/1')
    })
    expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'GET')).toHaveLength(2)
  })

  it('cancels the delete confirmation', async () => {
    global.fetch = mockFetch([DAILY])
    const user = userEvent.setup()

    render(
      <SchedulesModal
        token="tok"
        onClose={vi.fn()}
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
      />
    )

    await user.click(await screen.findByRole('button', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
    expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
  })

  it('shows the error when the delete fails', async () => {
    global.fetch = mockFetch([DAILY], {
      deleteResponse: {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Failed to delete the scheduled query.' }),
      },
    })
    const user = userEvent.setup()

    render(
      <SchedulesModal
        token="tok"
        onClose={vi.fn()}
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
      />
    )

    await user.click(await screen.findByRole('button', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(await screen.findByText('Failed to delete the scheduled query.')).toBeInTheDocument()
  })

  it('logs out when the list returns a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onLogout = vi.fn()

    render(
      <SchedulesModal
        token="tok"
        onClose={vi.fn()}
        onLogout={onLogout}
        selectedSources={['yolo']}
        selectedProfile="support"
      />
    )

    await waitFor(() => expect(onLogout).toHaveBeenCalled())
  })

  it('closes from the header and the footer', async () => {
    global.fetch = mockFetch([])
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <SchedulesModal
        token="tok"
        onClose={onClose}
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
      />
    )

    const [headerClose, footerClose] = screen.getAllByRole('button', { name: /^close$/i })
    await user.click(headerClose)
    await user.click(footerClose)

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('creates a schedule from the form and refreshes the list', async () => {
    global.fetch = vi.fn().mockImplementation((_url, options = {}) => {
      if (options.method === 'POST') {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ schedule: { id: 2 } }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ schedules: [] }) })
    })
    const user = userEvent.setup()

    render(
      <SchedulesModal
        token="tok"
        onClose={vi.fn()}
        onLogout={vi.fn()}
        selectedSources={['yolo']}
        selectedProfile="support"
      />
    )

    await user.type(await screen.findByLabelText(/question/i), 'Open PRs?')
    await user.click(screen.getByRole('button', { name: /create schedule/i }))

    await waitFor(() =>
      expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'GET')).toHaveLength(2)
    )
  })
})
