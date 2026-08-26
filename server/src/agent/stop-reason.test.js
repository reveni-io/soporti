import { describe, it, expect } from 'vitest'
import { createStopReasonTracker, STOP_REASON_REFUSAL, STOP_REASON_TURN_LIMIT } from './stop-reason.js'

describe('createStopReasonTracker', () => {
  it('reports no stop reason and no notice before any handler runs', () => {
    const tracker = createStopReasonTracker()

    expect(tracker.stopReason()).toBe(null)
    expect(tracker.notice()).toBe('')
  })

  it('records the turn limit and returns the notice as the run final output', () => {
    const tracker = createStopReasonTracker()

    const handled = tracker.errorHandlers.maxTurns()

    expect(tracker.stopReason()).toBe(STOP_REASON_TURN_LIMIT)
    expect(handled.finalOutput).toBe(tracker.notice())
    expect(handled.finalOutput).toMatch(/ran out of investigation steps/i)
  })

  it('records a model refusal with its own notice', () => {
    const tracker = createStopReasonTracker()

    const handled = tracker.errorHandlers.modelRefusal()

    expect(tracker.stopReason()).toBe(STOP_REASON_REFUSAL)
    expect(handled.finalOutput).toBe(tracker.notice())
    expect(handled.finalOutput).toMatch(/cannot answer that/i)
  })

  it('keeps trackers independent so one run does not leak into another', () => {
    const first = createStopReasonTracker()
    const second = createStopReasonTracker()

    first.errorHandlers.maxTurns()

    expect(first.stopReason()).toBe(STOP_REASON_TURN_LIMIT)
    expect(second.stopReason()).toBe(null)
    expect(second.notice()).toBe('')
  })
})
