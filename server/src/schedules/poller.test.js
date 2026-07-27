import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/schedules.js', () => ({ claimDueSchedules: vi.fn(), markScheduleRun: vi.fn() }))
vi.mock('./runner.js', () => ({ runSchedule: vi.fn() }))
vi.mock('../llm/model.js', () => ({ isConfigured: vi.fn() }))

const { claimDueSchedules, markScheduleRun } = await import('../db/schedules.js')
const { runSchedule } = await import('./runner.js')
const { isConfigured } = await import('../llm/model.js')
const { runPollOnce, startSchedulePoller, stopSchedulePoller } = await import('./poller.js')

const STORE = { createScheduled: vi.fn() }

const DAILY = { id: 1, question: 'Failed payments', frequency: 'daily', minute: 0, hour: 9, timezone: 'Europe/Madrid' }
const HOURLY = { id: 2, question: 'Open PRs', frequency: 'hourly', minute: 30, timezone: 'Europe/Madrid' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  isConfigured.mockResolvedValue(true)
  claimDueSchedules.mockResolvedValue([])
  markScheduleRun.mockResolvedValue(undefined)
  runSchedule.mockResolvedValue({ conversationId: 'conv_1' })
})

afterEach(() => {
  stopSchedulePoller()
  vi.restoreAllMocks()
})

describe('runPollOnce', () => {
  it('does nothing while the LLM provider is not configured', async () => {
    isConfigured.mockResolvedValue(false)

    expect(await runPollOnce(STORE)).toEqual({ ran: 0 })
    expect(claimDueSchedules).not.toHaveBeenCalled()
  })

  it('runs every due schedule and marks it as successful', async () => {
    claimDueSchedules.mockResolvedValue([DAILY, HOURLY])

    expect(await runPollOnce(STORE)).toEqual({ ran: 2 })

    expect(runSchedule).toHaveBeenNthCalledWith(1, DAILY, STORE)
    expect(runSchedule).toHaveBeenNthCalledWith(2, HOURLY, STORE)
    expect(markScheduleRun).toHaveBeenNthCalledWith(1, 1, { status: 'ok' })
    expect(markScheduleRun).toHaveBeenNthCalledWith(2, 2, { status: 'ok' })
  })

  it('claims a bounded batch and advances the next run of each row', async () => {
    await runPollOnce(STORE)

    const [limit, nextRunFor] = claimDueSchedules.mock.calls[0]
    expect(limit).toBeGreaterThan(0)
    expect(nextRunFor(DAILY)).toBeInstanceOf(Date)
  })

  it('records the failure and keeps running the rest of the batch', async () => {
    claimDueSchedules.mockResolvedValue([DAILY, HOURLY])
    runSchedule.mockRejectedValueOnce(new Error('model unavailable'))

    expect(await runPollOnce(STORE)).toEqual({ ran: 1 })

    expect(markScheduleRun).toHaveBeenNthCalledWith(1, 1, { status: 'error', error: 'model unavailable' })
    expect(markScheduleRun).toHaveBeenNthCalledWith(2, 2, { status: 'ok' })
  })

  it('truncates a long failure message before storing it', async () => {
    claimDueSchedules.mockResolvedValue([DAILY])
    runSchedule.mockRejectedValue(new Error('x'.repeat(900)))

    await runPollOnce(STORE)

    const [, { error }] = markScheduleRun.mock.calls[0]
    expect(error).toHaveLength(500)
  })

  it('survives a failure while storing the run status', async () => {
    claimDueSchedules.mockResolvedValue([DAILY])
    runSchedule.mockRejectedValue(new Error('model unavailable'))
    markScheduleRun.mockRejectedValue(new Error('db down'))

    expect(await runPollOnce(STORE)).toEqual({ ran: 0 })
  })
})

describe('startSchedulePoller', () => {
  it('polls immediately and then on every interval', async () => {
    vi.useFakeTimers()
    claimDueSchedules.mockResolvedValue([DAILY])

    startSchedulePoller(STORE)
    await vi.advanceTimersByTimeAsync(0)
    expect(claimDueSchedules).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(claimDueSchedules).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('keeps a single interval when called twice', () => {
    const first = startSchedulePoller(STORE)
    const second = startSchedulePoller(STORE)

    expect(second).toBe(first)
  })

  it('stops polling after stopSchedulePoller', async () => {
    vi.useFakeTimers()

    startSchedulePoller(STORE)
    await vi.advanceTimersByTimeAsync(0)
    stopSchedulePoller()
    await vi.advanceTimersByTimeAsync(180_000)

    expect(claimDueSchedules).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
