import { describe, it, expect, vi } from 'vitest'
import { frameLoop } from './frameLoop.js'

describe('frameLoop', () => {
  it('shows each frame for its duration and starts over until it is cancelled', async () => {
    const shown = []
    const slept = []
    let remaining = 5
    const play = frameLoop([
      { frame: 'a', ms: 100 },
      { frame: 'b', ms: 200 },
    ])

    await play({
      show: frame => shown.push(frame),
      sleep: async ms => {
        slept.push(ms)
        remaining--
      },
      isCancelled: () => remaining <= 0,
    })

    expect(shown).toEqual(['a', 'b', 'a', 'b', 'a'])
    expect(slept).toEqual([100, 200, 100, 200, 100])
  })

  it('does nothing once it is already cancelled', async () => {
    const show = vi.fn()

    await frameLoop([{ frame: 'a', ms: 100 }])({ show, sleep: vi.fn(), isCancelled: () => true })

    expect(show).not.toHaveBeenCalled()
  })
})
