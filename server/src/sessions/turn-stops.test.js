import { describe, it, expect, afterEach } from 'vitest'
import { _countTrackedTurnsForTests, isTurnStopped, releaseTurn, stopTurn, trackTurn } from './turn-stops.js'

const REQUEST_ID = '0b6f3c2a-5d4e-4f61-8a7b-9c0d1e2f3a4b'

afterEach(() => {
  releaseTurn(`7:${REQUEST_ID}`)
  releaseTurn(`8:${REQUEST_ID}`)
})

describe('turn-stops', () => {
  it('tracks a turn that has not been stopped', () => {
    const key = trackTurn(REQUEST_ID, 7)

    expect(isTurnStopped(key)).toBe(false)
    expect(_countTrackedTurnsForTests()).toBe(1)
  })

  it('marks a tracked turn as stopped by its user', () => {
    const key = trackTurn(REQUEST_ID, 7)

    expect(stopTurn(REQUEST_ID, 7)).toBe(true)
    expect(isTurnStopped(key)).toBe(true)
  })

  it('does not let another user stop the turn', () => {
    const key = trackTurn(REQUEST_ID, 7)

    expect(stopTurn(REQUEST_ID, 8)).toBe(false)
    expect(isTurnStopped(key)).toBe(false)
  })

  it('ignores a stop for a turn it does not track', () => {
    expect(stopTurn(REQUEST_ID, 7)).toBe(false)
    expect(_countTrackedTurnsForTests()).toBe(0)
  })

  it('tracks nothing when the request has no ID', () => {
    expect(trackTurn(undefined, 7)).toBeNull()
    expect(isTurnStopped(null)).toBe(false)
    expect(_countTrackedTurnsForTests()).toBe(0)
  })

  it('forgets a released turn', () => {
    const key = trackTurn(REQUEST_ID, 7)
    stopTurn(REQUEST_ID, 7)

    releaseTurn(key)
    releaseTurn(null)

    expect(isTurnStopped(key)).toBe(false)
    expect(_countTrackedTurnsForTests()).toBe(0)
  })
})
