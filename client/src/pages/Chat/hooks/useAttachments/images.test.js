import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildThumbnail, shrinkImage } from './images.js'

const THUMBNAIL = 'data:image/webp;base64,dGh1bWI='
const MAX_IMAGE_BYTES = 7 * 1024 * 1024

function stubCanvas({ dataUri = THUMBNAIL, context = {}, blobSizes = [] } = {}) {
  const canvas = {
    width: 0,
    height: 0,
    sizes: [],
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => dataUri),
    toBlob: vi.fn((callback, mimeType) => {
      canvas.sizes.push({ width: canvas.width, height: canvas.height })
      const size = blobSizes.length > 0 ? blobSizes.shift() : 0
      callback(size === null ? null : { size, type: mimeType })
    }),
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

describe('shrinkImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete global.createImageBitmap
  })

  function imageFile(name, size) {
    const file = new File(['bytes'], name, { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: size })
    return file
  }

  it('leaves an image that already fits the provider budget untouched', async () => {
    stubBitmap(1200, 800)
    const canvas = stubCanvas({ context: { drawImage: vi.fn() } })
    const file = imageFile('small.png', 1024)

    expect(await shrinkImage(file)).toBe(file)
    expect(canvas.toBlob).not.toHaveBeenCalled()
  })

  it('re-encodes an image whose bytes exceed the provider budget', async () => {
    stubBitmap(4000, 3000)
    stubCanvas({ context: { drawImage: vi.fn() }, blobSizes: [1_000_000] })
    const file = imageFile('huge.png', 9 * 1024 * 1024)

    const shrunk = await shrinkImage(file)

    expect(shrunk).not.toBe(file)
    expect(shrunk.type).toBe('image/webp')
    expect(shrunk.name).toBe('huge.webp')
  })

  it('scales an image down past the provider dimension cap', async () => {
    stubBitmap(12000, 6000)
    const canvas = stubCanvas({ context: { drawImage: vi.fn() }, blobSizes: [1000] })
    const file = imageFile('wide.png', 1024)

    await shrinkImage(file)

    expect(canvas.sizes[0]).toEqual({ width: 8000, height: 4000 })
  })

  it('keeps shrinking until the result fits the budget', async () => {
    stubBitmap(6000, 6000)
    const canvas = stubCanvas({
      context: { drawImage: vi.fn() },
      blobSizes: [MAX_IMAGE_BYTES + 1, MAX_IMAGE_BYTES + 1, 500],
    })

    const shrunk = await shrinkImage(imageFile('big.png', 9 * 1024 * 1024))

    expect(canvas.sizes).toHaveLength(3)
    expect(canvas.sizes[1].width).toBeLessThan(canvas.sizes[0].width)
    expect(canvas.sizes[2].width).toBeLessThan(canvas.sizes[1].width)
    expect(shrunk.name).toBe('big.webp')
  })

  it('gives up after the attempt budget and returns the original file', async () => {
    stubBitmap(6000, 6000)
    const canvas = stubCanvas({
      context: { drawImage: vi.fn() },
      blobSizes: Array.from({ length: 6 }, () => MAX_IMAGE_BYTES + 1),
    })
    const file = imageFile('stubborn.png', 9 * 1024 * 1024)

    expect(await shrinkImage(file)).toBe(file)
    expect(canvas.sizes).toHaveLength(6)
  })

  it('returns the original file when the browser cannot decode or encode it', async () => {
    global.createImageBitmap = vi.fn().mockRejectedValue(new Error('bad image'))
    const undecodable = imageFile('broken.png', 9 * 1024 * 1024)
    expect(await shrinkImage(undecodable)).toBe(undecodable)

    stubBitmap(4000, 3000)
    stubCanvas({ context: { drawImage: vi.fn() }, blobSizes: [null] })
    const unencodable = imageFile('huge.png', 9 * 1024 * 1024)
    expect(await shrinkImage(unencodable)).toBe(unencodable)
  })

  it('releases the decoded bitmap', async () => {
    const bitmap = stubBitmap(4000, 3000)
    stubCanvas({ context: { drawImage: vi.fn() }, blobSizes: [1000] })

    await shrinkImage(imageFile('huge.png', 9 * 1024 * 1024))

    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })
})
