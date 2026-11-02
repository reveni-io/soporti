import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/video-versions.js', () => ({ saveVersionProgress: vi.fn() }))

const { saveVersionProgress } = await import('../db/video-versions.js')
const { createProgressReporter, formatClock } = await import('./progress.js')

const VERSION = { id: 31, events: [] }

describe('formatClock', () => {
  it('formats seconds as minutes and two-digit seconds', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(2.4)).toBe('0:02')
    expect(formatClock(62)).toBe('1:02')
    expect(formatClock(-3)).toBe('0:00')
  })
})

describe('createProgressReporter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T10:00:00.000Z'))
    saveVersionProgress.mockReset().mockResolvedValue({ cancelRequested: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the first update at once and merges the next ones into one write per second', async () => {
    const reporter = createProgressReporter(VERSION)

    reporter.update({ phase: 'rendering', progress: 10 })
    await vi.advanceTimersByTimeAsync(0)
    reporter.update({ progress: 20 })
    reporter.step('Rendering frame 40 of 200')
    await vi.advanceTimersByTimeAsync(500)

    expect(saveVersionProgress).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)

    expect(saveVersionProgress).toHaveBeenCalledTimes(2)
    expect(saveVersionProgress).toHaveBeenNthCalledWith(1, 31, { phase: 'rendering', progress: 10, events: [] })
    expect(saveVersionProgress).toHaveBeenNthCalledWith(2, 31, {
      progress: 20,
      step: 'Rendering frame 40 of 200',
      events: [],
    })
  })

  it('appends events after the ones already stored and keeps the last 50', async () => {
    const stored = Array.from({ length: 50 }, (_, i) => ({ at: '2026-11-02T09:00:00.000Z', text: `old ${i}` }))
    const reporter = createProgressReporter({ id: 31, events: stored })

    reporter.event('Copied the brand fonts')
    await vi.advanceTimersByTimeAsync(0)

    const { events } = saveVersionProgress.mock.calls[0][1]
    expect(events).toHaveLength(50)
    expect(events[0].text).toBe('old 1')
    expect(events.at(-1)).toEqual({ at: '2026-11-02T10:00:00.000Z', text: 'Copied the brand fonts' })
  })

  it('clips long steps', async () => {
    const reporter = createProgressReporter(VERSION)

    reporter.step('x'.repeat(400))
    await vi.advanceTimersByTimeAsync(0)

    expect(saveVersionProgress.mock.calls[0][1].step).toHaveLength(300)
  })

  it('aborts the version when the database says a cancel was requested', async () => {
    saveVersionProgress.mockResolvedValue({ cancelRequested: true })
    const onCancelRequested = vi.fn()
    const reporter = createProgressReporter(VERSION, { onCancelRequested })

    reporter.update({ progress: 5 })
    await vi.advanceTimersByTimeAsync(0)

    expect(onCancelRequested).toHaveBeenCalledTimes(1)
  })

  it('flushes the pending update on close and ignores updates after it', async () => {
    const reporter = createProgressReporter(VERSION)
    reporter.update({ progress: 1 })
    await vi.advanceTimersByTimeAsync(0)
    reporter.update({ progress: 99 })

    await reporter.close()
    reporter.update({ progress: 100 })
    await vi.advanceTimersByTimeAsync(5000)

    expect(saveVersionProgress).toHaveBeenCalledTimes(2)
    expect(saveVersionProgress).toHaveBeenLastCalledWith(31, { progress: 99, events: [] })
    await expect(reporter.close()).resolves.toBeUndefined()
  })

  it('logs a failed write and keeps going', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    saveVersionProgress.mockRejectedValueOnce(new Error('connection lost'))
    const reporter = createProgressReporter(VERSION)

    reporter.update({ progress: 1 })
    await vi.advanceTimersByTimeAsync(0)
    reporter.update({ progress: 2 })
    await vi.advanceTimersByTimeAsync(1000)

    expect(consoleError).toHaveBeenCalledWith(
      '[videos] Failed to save the progress of a video version:',
      31,
      expect.any(Error)
    )
    expect(saveVersionProgress).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })
})
