import { describe, it, expect, vi } from 'vitest'
import { extractFileIds, downloadImageAsDataUri, collectTicketImages } from './attachments.js'

function mockResponse({ ok = true, contentType = 'image/png', bytes = [1, 2, 3] } = {}) {
  return {
    ok,
    headers: { get: () => contentType },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  }
}

// A WebClient stub whose files.info returns the given file objects by id.
function fileInfoClient(filesById) {
  return {
    apiCall: vi.fn(async (method, { file }) => {
      if (method !== 'files.info') throw new Error(`unexpected method ${method}`)
      if (!filesById[file]) throw new Error('file_not_found')
      return { file: filesById[file] }
    }),
  }
}

describe('extractFileIds', () => {
  it('collects file ids from attachment cells (string ids and {id} objects)', () => {
    const item = {
      fields: [
        { key: 'Col1', value: 'F0AAA111', attachment: ['F0AAA111'], column_id: 'ColX' },
        { attachment: [{ id: 'F0BBB222' }] },
        { text: 'no attachment' },
      ],
    }
    expect(extractFileIds(item)).toEqual(['F0AAA111', 'F0BBB222'])
  })

  it('returns empty for an item with no attachment cells', () => {
    expect(extractFileIds({ fields: [{ text: 'x' }] })).toEqual([])
  })
})

describe('downloadImageAsDataUri', () => {
  it('returns a base64 data URI for an image', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ bytes: [1, 2, 3] }))
    const uri = await downloadImageAsDataUri('https://files.slack.com/x.png', {
      botToken: 'xoxb',
      maxBytes: 1000,
      fetchImpl,
    })
    expect(uri).toBe('data:image/png;base64,AQID')
    expect(fetchImpl).toHaveBeenCalledWith('https://files.slack.com/x.png', {
      headers: { Authorization: 'Bearer xoxb' },
    })
  })

  it('rejects a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ ok: false }))
    await expect(downloadImageAsDataUri('u', { botToken: 't', maxBytes: 100, fetchImpl })).rejects.toThrow(
      /download failed/
    )
  })

  it('rejects non-image content', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ contentType: 'application/pdf' }))
    await expect(downloadImageAsDataUri('u', { botToken: 't', maxBytes: 100, fetchImpl })).rejects.toThrow(
      /not an image/
    )
  })

  it('rejects an oversized image', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ bytes: [1, 2, 3, 4] }))
    await expect(downloadImageAsDataUri('u', { botToken: 't', maxBytes: 2, fetchImpl })).rejects.toThrow(/too large/)
  })
})

describe('collectTicketImages', () => {
  const item = { fields: [{ attachment: ['F0FAKEFILE1'] }] }

  it('returns empty without a client or bot token', async () => {
    expect(await collectTicketImages(item, { client: null, botToken: 'x', maxBytes: 100 })).toEqual([])
    expect(await collectTicketImages(item, { client: {}, botToken: '', maxBytes: 100 })).toEqual([])
  })

  it('resolves file ids via files.info and downloads images', async () => {
    const client = fileInfoClient({
      F0FAKEFILE1: { url_private: 'https://files.slack.com/x.png', mimetype: 'image/png', size: 3 },
    })
    const fetchImpl = vi.fn(async () => mockResponse({ bytes: [1, 2, 3] }))
    const images = await collectTicketImages(item, { client, botToken: 'xoxb', maxBytes: 1000, fetchImpl })
    expect(client.apiCall).toHaveBeenCalledWith('files.info', { file: 'F0FAKEFILE1' })
    expect(fetchImpl).toHaveBeenCalledWith('https://files.slack.com/x.png', {
      headers: { Authorization: 'Bearer xoxb' },
    })
    expect(images).toEqual(['data:image/png;base64,AQID'])
  })

  it('skips non-image files without downloading', async () => {
    const client = fileInfoClient({ F0FAKEFILE1: { url_private: 'u', mimetype: 'application/pdf' } })
    const fetchImpl = vi.fn()
    const images = await collectTicketImages(item, { client, botToken: 'xoxb', maxBytes: 1000, fetchImpl })
    expect(images).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('skips files larger than maxBytes (per files.info) without downloading', async () => {
    const client = fileInfoClient({ F0FAKEFILE1: { url_private: 'u', mimetype: 'image/png', size: 999 } })
    const fetchImpl = vi.fn()
    const images = await collectTicketImages(item, { client, botToken: 'xoxb', maxBytes: 100, fetchImpl })
    expect(images).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('skips a file whose files.info fails', async () => {
    const client = {
      apiCall: vi.fn(async () => {
        throw new Error('file_not_found')
      }),
    }
    const fetchImpl = vi.fn()
    const images = await collectTicketImages(
      { fields: [{ attachment: ['F0MISSING'] }] },
      { client, botToken: 'x', maxBytes: 100, fetchImpl }
    )
    expect(images).toEqual([])
  })
})
