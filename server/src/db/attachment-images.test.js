import { describe, it, expect, beforeEach, vi } from 'vitest'

let queue = []
let calls = []

function makeChain(op) {
  const call = { op, steps: {} }
  calls.push(call)
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    returning: () => chain,
    values: v => {
      call.steps.values = v
      return chain
    },
    then: (resolve, reject) => {
      const next = queue.shift()
      const promise = next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? [])
      return promise.then(resolve, reject)
    },
  }
  return chain
}

vi.mock('./index.js', () => ({
  getDb: () => ({
    select: () => makeChain('select'),
    insert: () => makeChain('insert'),
    delete: () => makeChain('delete'),
  }),
}))

vi.mock('../config.js', () => ({ default: { documents: { imageRetentionDays: 30 } } }))

const { createAttachmentImage, getAttachmentImage, getAttachmentImages, deleteExpiredAttachmentImages } =
  await import('./attachment-images.js')

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

beforeEach(() => {
  queue = []
  calls = []
})

describe('createAttachmentImage', () => {
  it('stores the base64 payload with its size and an expiry 30 days out', async () => {
    const before = Date.now()

    const { id, expiresAt } = await createAttachmentImage({
      userId: 7,
      name: 'screenshot.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    })

    const insert = calls.find(c => c.op === 'insert')
    expect(insert.steps.values).toMatchObject({
      id,
      userId: 7,
      name: 'screenshot.png',
      mimeType: 'image/png',
      data: PNG_BYTES.toString('base64'),
      byteSize: PNG_BYTES.length,
    })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 24 * 60 * 60 * 1000)
  })
})

describe('getAttachmentImage', () => {
  it('returns the name and a data URI built from the stored row', async () => {
    queue = [[{ name: 'screenshot.png', mimeType: 'image/png', data: 'aGk=' }]]

    expect(await getAttachmentImage('11111111-1111-4111-8111-111111111111', 7)).toEqual({
      name: 'screenshot.png',
      image: 'data:image/png;base64,aGk=',
    })
  })

  it('returns null when the image is missing, expired or owned by someone else', async () => {
    queue = [[]]

    expect(await getAttachmentImage('11111111-1111-4111-8111-111111111111', 7)).toBeNull()
  })
})

describe('getAttachmentImages', () => {
  it('maps every found id to its data URI', async () => {
    queue = [
      [
        { id: 'a', mimeType: 'image/png', data: 'aGk=' },
        { id: 'b', mimeType: 'image/jpeg', data: 'eW8=' },
      ],
    ]

    const images = await getAttachmentImages(['a', 'b'], 7)

    expect(images.get('a')).toBe('data:image/png;base64,aGk=')
    expect(images.get('b')).toBe('data:image/jpeg;base64,eW8=')
  })

  it('leaves out an id that was not found', async () => {
    queue = [[{ id: 'a', mimeType: 'image/png', data: 'aGk=' }]]

    const images = await getAttachmentImages(['a', 'gone'], 7)

    expect(images.size).toBe(1)
    expect(images.has('gone')).toBe(false)
  })

  it('does not query when there are no ids', async () => {
    expect(await getAttachmentImages([], 7)).toEqual(new Map())
    expect(calls).toHaveLength(0)
  })
})

describe('deleteExpiredAttachmentImages', () => {
  it('returns how many rows it removed', async () => {
    queue = [[{ id: 'a' }, { id: 'b' }]]

    expect(await deleteExpiredAttachmentImages()).toBe(2)
    expect(calls.find(c => c.op === 'delete')).toBeDefined()
  })
})
