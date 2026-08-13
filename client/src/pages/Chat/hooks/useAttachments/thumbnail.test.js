import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildThumbnail } from './thumbnail.js'

const THUMBNAIL = 'data:image/webp;base64,dGh1bWI='

function stubCanvas({ dataUri = THUMBNAIL, context = {} } = {}) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => dataUri),
  }
  const createElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(tag => (tag === 'canvas' ? canvas : createElement(tag)))
  return canvas
}

function stubBitmap(width, height) {
  const bitmap = { width, height, close: vi.fn() }
  global.createImageBitmap = vi.fn(async () => bitmap)
  return bitmap
}

describe('buildThumbnail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete global.createImageBitmap
  })

  it('downscales the longest side to the thumbnail budget and keeps the aspect ratio', async () => {
    stubBitmap(1920, 960)
    const drawImage = vi.fn()
    const canvas = stubCanvas({ context: { drawImage } })

    expect(await buildThumbnail(new File(['x'], 'wide.png', { type: 'image/png' }))).toBe(THUMBNAIL)
    expect(canvas.width).toBe(96)
    expect(canvas.height).toBe(48)
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 96, 48)
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.7)
  })

  it('leaves an image already smaller than the budget at its own size', async () => {
    stubBitmap(40, 20)
    const canvas = stubCanvas({ context: { drawImage: vi.fn() } })

    await buildThumbnail(new File(['x'], 'small.png', { type: 'image/png' }))

    expect(canvas.width).toBe(40)
    expect(canvas.height).toBe(20)
  })

  it('never scales a side below one pixel', async () => {
    stubBitmap(4000, 1)
    const canvas = stubCanvas({ context: { drawImage: vi.fn() } })

    await buildThumbnail(new File(['x'], 'strip.png', { type: 'image/png' }))

    expect(canvas.height).toBe(1)
  })

  it('releases the decoded bitmap once it is drawn', async () => {
    const bitmap = stubBitmap(100, 100)
    stubCanvas({ context: { drawImage: vi.fn() } })

    await buildThumbnail(new File(['x'], 'a.png', { type: 'image/png' }))

    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('returns null when the browser cannot decode the file', async () => {
    global.createImageBitmap = vi.fn().mockRejectedValue(new Error('bad image'))

    expect(await buildThumbnail(new File(['x'], 'broken.png', { type: 'image/png' }))).toBeNull()
  })

  it('returns null when there is no 2d canvas to draw on', async () => {
    stubBitmap(100, 100)
    stubCanvas({ context: null })

    expect(await buildThumbnail(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull()
  })

  it('returns null when the canvas cannot encode the requested format', async () => {
    stubBitmap(100, 100)
    stubCanvas({ dataUri: 'data:image/png;base64,fallback', context: { drawImage: vi.fn() } })

    expect(await buildThumbnail(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull()
  })

  it('returns null when the browser has no createImageBitmap at all', async () => {
    delete global.createImageBitmap

    expect(await buildThumbnail(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull()
  })
})
