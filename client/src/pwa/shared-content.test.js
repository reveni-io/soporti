import { describe, it, expect, vi, afterEach } from 'vitest'
import { clearSharedContent, readSharedContent } from './shared-content.js'

function stubShareCache(entries) {
  const storage = {
    match: vi.fn(async (path, options) => {
      if (options?.cacheName !== 'soporti-share-target') return undefined
      return entries[path]
    }),
    delete: vi.fn().mockResolvedValue(true),
  }
  vi.stubGlobal('caches', storage)

  return storage
}

function payloadResponse(payload) {
  return { json: async () => payload }
}

function fileResponse(content, type) {
  return { blob: async () => new Blob([content], { type }) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('shared-content', () => {
  it('returns nothing when no share is stored', async () => {
    stubShareCache({})

    await expect(readSharedContent()).resolves.toBeNull()
  })

  it('returns nothing in a browser without Cache Storage', async () => {
    await expect(readSharedContent()).resolves.toBeNull()
  })

  it('rebuilds the shared files with their names and types', async () => {
    stubShareCache({
      '/share-target/payload': payloadResponse({
        title: '',
        text: '',
        url: '',
        files: [
          { name: 'shot.png', type: 'image/png', path: '/share-target/files/0' },
          { name: 'refunds.csv', type: 'text/csv', path: '/share-target/files/1' },
        ],
      }),
      '/share-target/files/0': fileResponse('png-bytes', 'image/png'),
      '/share-target/files/1': fileResponse('id,amount', 'text/csv'),
    })

    const content = await readSharedContent()

    expect(content.text).toBe('')
    expect(content.files).toHaveLength(2)
    expect(content.files[0]).toBeInstanceOf(File)
    expect(content.files[0].name).toBe('shot.png')
    expect(content.files[0].type).toBe('image/png')
    expect(await content.files[1].text()).toBe('id,amount')
  })

  it('keeps only as many shared files as a message can attach', async () => {
    const files = ['a', 'b', 'c', 'd'].map((name, index) => ({
      name: `${name}.png`,
      type: 'image/png',
      path: `/share-target/files/${index}`,
    }))
    stubShareCache({
      '/share-target/payload': payloadResponse({ title: '', text: '', url: '', files }),
      ...Object.fromEntries(files.map(file => [file.path, fileResponse('png-bytes', 'image/png')])),
    })

    const content = await readSharedContent()

    expect(content.files.map(file => file.name)).toEqual(['a.png', 'b.png', 'c.png'])
  })

  it('skips a shared file whose body is missing', async () => {
    stubShareCache({
      '/share-target/payload': payloadResponse({
        title: '',
        text: '',
        url: '',
        files: [{ name: 'gone.png', type: 'image/png', path: '/share-target/files/0' }],
      }),
    })

    const content = await readSharedContent()

    expect(content.files).toEqual([])
  })

  it('joins the title, text and link and leaves out the empty ones', async () => {
    stubShareCache({
      '/share-target/payload': payloadResponse({
        title: 'Refund failed',
        text: '',
        url: 'https://shop.example/orders/42',
        files: [],
      }),
    })

    const content = await readSharedContent()

    expect(content.text).toBe('Refund failed\n\nhttps://shop.example/orders/42')
  })

  it('does not repeat a link or title the shared text already contains', async () => {
    stubShareCache({
      '/share-target/payload': payloadResponse({
        title: 'Order 42',
        text: 'Order 42 is stuck https://shop.example/orders/42',
        url: 'https://shop.example/orders/42',
        files: [],
      }),
    })

    const content = await readSharedContent()

    expect(content.text).toBe('Order 42 is stuck https://shop.example/orders/42')
  })

  it('deletes the stored share', async () => {
    const storage = stubShareCache({})

    await clearSharedContent()

    expect(storage.delete).toHaveBeenCalledTimes(1)
    expect(storage.delete).toHaveBeenCalledWith('soporti-share-target')
  })

  it('has nothing to delete in a browser without Cache Storage', async () => {
    await expect(clearSharedContent()).resolves.toBeUndefined()
  })
})
