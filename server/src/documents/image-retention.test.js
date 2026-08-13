import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/attachment-images.js', () => ({
  deleteExpiredAttachmentImages: vi.fn(),
}))

const { deleteExpiredAttachmentImages } = await import('../db/attachment-images.js')
const { sweepExpiredImages, startImageRetention, stopImageRetention } = await import('./image-retention.js')

describe('image retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    deleteExpiredAttachmentImages.mockResolvedValue(0)
  })

  afterEach(() => {
    stopImageRetention()
    vi.useRealTimers()
  })

  it('reports how many expired images it removed', async () => {
    deleteExpiredAttachmentImages.mockResolvedValue(3)

    expect(await sweepExpiredImages()).toBe(3)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('removed 3 expired image(s)'))
  })

  it('stays quiet when there was nothing to remove', async () => {
    expect(await sweepExpiredImages()).toBe(0)
    expect(console.log).not.toHaveBeenCalled()
  })

  it('swallows a database failure so the sweep never crashes the server', async () => {
    deleteExpiredAttachmentImages.mockRejectedValue(new Error('db down'))

    expect(await sweepExpiredImages()).toBe(0)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('retention sweep failed'), 'db down')
  })

  it('sweeps once on start and then on every interval', async () => {
    vi.useFakeTimers()

    startImageRetention()
    expect(deleteExpiredAttachmentImages).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(deleteExpiredAttachmentImages).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(deleteExpiredAttachmentImages).toHaveBeenCalledTimes(3)
  })

  it('starts only one interval however often it is started', () => {
    vi.useFakeTimers()

    expect(startImageRetention()).toBe(startImageRetention())
  })

  it('stops sweeping once stopped, and tolerates being stopped twice', async () => {
    vi.useFakeTimers()

    startImageRetention()
    stopImageRetention()
    stopImageRetention()

    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000)

    expect(deleteExpiredAttachmentImages).toHaveBeenCalledTimes(1)
  })
})
