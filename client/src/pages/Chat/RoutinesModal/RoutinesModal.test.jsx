import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RoutinesModal from './RoutinesModal.jsx'

const BOT = { id: 3, name: 'Ticket triager', description: 'Reviews tickets.', avatarSeed: 'seed-3' }

const QUEUE_REVIEW = {
  id: 9,
  title: 'Queue review',
  instruction: 'Review the new Zendesk tickets and tell me which ones are urgent.',
  frequency: 'weekdays',
  minute: 0,
  hour: 17,
  weekday: null,
  monthDay: null,
  runDate: null,
  timezone: 'Europe/Madrid',
  paused: false,
  nextRunAt: '2026-11-18T16:00:00.000Z',
  lastRunAt: '2026-11-17T16:00:00.000Z',
  lastStatus: 'ok',
}

const LAUNCH_REMINDER = {
  ...QUEUE_REVIEW,
  id: 10,
  title: 'Launch reminder',
  instruction: 'Remind me to announce the launch.',
  frequency: 'once',
  runDate: '2026-11-20',
  hour: 9,
  paused: true,
  lastRunAt: null,
  lastStatus: null,
}

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function mockRoutines(...responses) {
  const queue = [...responses]
  global.fetch = vi.fn().mockImplementation((url, options) => {
    if (options.method === 'GET') return Promise.resolve(queue.length > 1 ? queue.shift() : queue[0])
    return Promise.resolve(respond({ ok: true }))
  })
}

function writeCalls() {
  return global.fetch.mock.calls.filter(([, options]) => options.method !== 'GET')
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('RoutinesModal', () => {
  it('shows a loading line while the routines load', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Routines' })).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('explains how to create a routine when the bot has none', async () => {
    mockRoutines(respond({ routines: [] }))

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)

    expect(await screen.findByText(/No routines yet\. Ask the bot to do something on a schedule/)).toBeInTheDocument()
    expect(global.fetch.mock.calls[0][0]).toBe('/api/bots/3/routines')
  })

  it('shows why the routines could not be loaded', async () => {
    mockRoutines(respond({}, 500))

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load the routines')
  })

  it('lists each routine with its schedule, next run and last run', async () => {
    mockRoutines(respond({ routines: [QUEUE_REVIEW] }))

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)

    const row = (await screen.findByText('Queue review')).closest('li')
    expect(
      within(row).getByText('Review the new Zendesk tickets and tell me which ones are urgent.')
    ).toBeInTheDocument()
    expect(within(row).getByText('Every weekday at 17:00 · Europe/Madrid')).toBeInTheDocument()
    expect(within(row).getByText(/^Next run .* · Last run /)).toBeInTheDocument()
    expect(within(row).queryByText('Paused')).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('marks a paused routine and offers to resume it', async () => {
    mockRoutines(respond({ routines: [LAUNCH_REMINDER] }))

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)

    const row = (await screen.findByText('Launch reminder')).closest('li')
    expect(within(row).getByText('Paused')).toBeInTheDocument()
    expect(within(row).getByText('Once on 2026-11-20 at 09:00 · Europe/Madrid')).toBeInTheDocument()
    expect(within(row).queryByText(/Next run/)).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('tells when the last run failed', async () => {
    mockRoutines(respond({ routines: [{ ...QUEUE_REVIEW, lastStatus: 'error' }] }))

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)

    expect(await screen.findByText('The last run failed.')).toBeInTheDocument()
  })

  it('pauses a routine and shows it paused', async () => {
    mockRoutines(respond({ routines: [QUEUE_REVIEW] }), respond({ routines: [{ ...QUEUE_REVIEW, paused: true }] }))
    const user = userEvent.setup()

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Pause' }))

    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument()
    expect(writeCalls()).toHaveLength(1)
    const [url, options] = writeCalls()[0]
    expect(url).toBe('/api/bots/3/routines/9')
    expect(options.method).toBe('PATCH')
    expect(JSON.parse(options.body)).toEqual({ paused: true })
  })

  it('resumes a paused routine', async () => {
    mockRoutines(
      respond({ routines: [LAUNCH_REMINDER] }),
      respond({ routines: [{ ...LAUNCH_REMINDER, paused: false }] })
    )
    const user = userEvent.setup()

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Resume' }))

    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(JSON.parse(writeCalls()[0][1].body)).toEqual({ paused: false })
  })

  it('asks before deleting a routine and removes it', async () => {
    mockRoutines(respond({ routines: [QUEUE_REVIEW] }), respond({ routines: [] }))
    const user = userEvent.setup()

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('group', { name: 'Delete this routine?' })).toBeInTheDocument()
    expect(writeCalls()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByText(/No routines yet/)).toBeInTheDocument()
    expect(writeCalls()).toHaveLength(1)
    expect(writeCalls()[0][0]).toBe('/api/bots/3/routines/9')
    expect(writeCalls()[0][1].method).toBe('DELETE')
  })

  it('shows why a routine could not be changed', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (options.method === 'GET') return Promise.resolve(respond({ routines: [QUEUE_REVIEW] }))
      return Promise.resolve(respond({ error: 'Routine not found.' }, 404))
    })
    const user = userEvent.setup()

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Pause' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Routine not found.')
  })

  it('logs out when the routines answer 401', async () => {
    mockRoutines(respond({}, 401))
    const onLogout = vi.fn()

    render(<RoutinesModal bot={BOT} token="tok" onClose={vi.fn()} onLogout={onLogout} />)

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes', async () => {
    mockRoutines(respond({ routines: [] }))
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(<RoutinesModal bot={BOT} token="tok" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
