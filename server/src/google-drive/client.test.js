import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    google: {
      drive: {
        maxBytes: 25 * 1024 * 1024,
        maxChars: 50000,
        downloadTimeoutMs: 60000,
        parseConcurrency: 2,
      },
    },
  },
}))

vi.mock('../config.js', () => ({ default: mockConfig }))

const { creds } = vi.hoisted(() => ({
  creds: { value: { client_email: 'sa@proj.iam.gserviceaccount.com', private_key: 'PRIVATE' } },
}))
vi.mock('./settings.js', () => ({
  getDriveCredentials: vi.fn(async () => creds.value),
}))

vi.mock('google-auth-library', () => ({
  JWT: class {
    async getAccessToken() {
      return { token: 'fake-token' }
    }
  },
}))

vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn().mockResolvedValue({}),
  extractText: vi.fn().mockResolvedValue({ text: 'PDF text' }),
}))
vi.mock('mammoth', () => ({ default: { extractRawText: vi.fn().mockResolvedValue({ value: 'Docx body' }) } }))
vi.mock('exceljs', () => {
  class Workbook {
    constructor() {
      this.xlsx = { load: vi.fn().mockResolvedValue(undefined) }
    }
    eachSheet(cb) {
      cb({
        name: 'Sheet1',
        eachRow: rcb => {
          rcb({ values: [undefined, 'a', 'b'] })
          rcb({ values: [undefined, { error: '#DIV/0!' }, { formula: 'SUM(A:A)', result: { error: '#REF!' } }] })
        },
      })
    }
  }
  return { default: { Workbook } }
})
vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn().mockResolvedValue({
      files: { 'ppt/slides/slide1.xml': {} },
      file: p => (p === 'ppt/slides/slide1.xml' ? { async: () => Promise.resolve('<xml/>') } : null),
    }),
  },
}))

const { recorder } = vi.hoisted(() => ({ recorder: {} }))
vi.mock('fast-xml-parser', () => ({
  XMLParser: class {
    constructor(opts) {
      recorder.xmlOpts = opts
    }
    parse() {
      return { 'a:t': 'Slide text' }
    }
  },
}))

const drive = await import('./client.js')

const DOC = 'application/vnd.google-apps.document'
const SHEET = 'application/vnd.google-apps.spreadsheet'
const SLIDES = 'application/vnd.google-apps.presentation'
const FOLDER = 'application/vnd.google-apps.folder'
const DRAWING = 'application/vnd.google-apps.drawing'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

const DEFAULTS = { maxBytes: 25 * 1024 * 1024, maxChars: 50000, downloadTimeoutMs: 60000, parseConcurrency: 2 }

function jsonResp(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) }
}
function errResp(status, reason) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => JSON.stringify({ error: { errors: reason ? [{ reason }] : [] } }),
  }
}
function textResp(text) {
  return { ok: true, status: 200, text: async () => text }
}
function blobResp(bytes, { contentLength } = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: h => (h.toLowerCase() === 'content-length' ? (contentLength ?? null) : null) },
    body: (async function* () {
      yield bytes
    })(),
  }
}

beforeEach(() => {
  global.fetch = vi.fn()
  Object.assign(mockConfig.google.drive, DEFAULTS)
  creds.value = { client_email: 'sa@proj.iam.gserviceaccount.com', private_key: 'PRIVATE' }
})

describe('isConfigured', () => {
  it('is true when credentials are present, false otherwise', async () => {
    expect(await drive.isConfigured()).toBe(true)
    creds.value = null
    expect(await drive.isConfigured()).toBe(false)
  })
})

describe('searchFiles', () => {
  it('returns mapped files with shared-drive params and relevance order', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResp({ files: [{ id: '1', name: 'Refund policy', mimeType: DOC, modifiedTime: 't', webViewLink: 'u' }] })
    )
    const res = await drive.searchFiles('refund')
    expect(res.files).toEqual([{ id: '1', name: 'Refund policy', mimeType: DOC, url: 'u', modifiedTime: 't' }])
    expect(res.incompleteSearch).toBe(false)
    expect(res.hasMore).toBe(false)
    const url = global.fetch.mock.calls[0][0]
    expect(url).toContain('corpora=allDrives')
    expect(url).toContain('includeItemsFromAllDrives=true')
    expect(url).toContain('supportsAllDrives=true')
  })

  it('escapes backslashes and single quotes in the query', async () => {
    global.fetch.mockResolvedValueOnce(jsonResp({ files: [] }))
    await drive.searchFiles("quinn's paper\\essay")
    const q = new URL(global.fetch.mock.calls[0][0]).searchParams.get('q')
    expect(q).toContain("quinn\\'s paper\\\\essay")
  })

  it('surfaces incompleteSearch and hasMore', async () => {
    global.fetch.mockResolvedValueOnce(jsonResp({ files: [], incompleteSearch: true, nextPageToken: 'abc' }))
    const res = await drive.searchFiles('x')
    expect(res.incompleteSearch).toBe(true)
    expect(res.hasMore).toBe(true)
  })

  it('degrades a 403 to an empty result with a notice instead of throwing', async () => {
    global.fetch.mockResolvedValueOnce(errResp(403, 'insufficientPermissions'))
    const res = await drive.searchFiles('x')
    expect(res.files).toEqual([])
    expect(res.error).toBe('access_denied')
  })

  it('redacts credential-shaped file names', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResp({ files: [{ id: '1', name: 'sk-abcdefghijklmnopqrstuvwxyz', mimeType: DOC, webViewLink: 'u' }] })
    )
    const res = await drive.searchFiles('x')
    expect(res.files[0].name).toBe('[redacted]')
  })
})

describe('listFiles', () => {
  it('queries direct children of a folder', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResp({ files: [{ id: 'c1', name: 'Child', mimeType: FOLDER, modifiedTime: 't', webViewLink: 'u' }] })
    )
    const res = await drive.listFiles('folder1')
    expect(res.files).toHaveLength(1)
    const q = new URL(global.fetch.mock.calls[0][0]).searchParams.get('q')
    expect(q).toBe("'folder1' in parents and trashed = false")
  })

  it('lists shared roots + shared drives when no folderId is given', async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResp({ files: [{ id: 's1', name: 'Shared folder', mimeType: FOLDER, webViewLink: 'u' }] })
      )
      .mockResolvedValueOnce(jsonResp({ drives: [{ id: 'd1', name: 'Team Drive' }] }))
    const res = await drive.listFiles()
    expect(res.files.map(f => f.id)).toEqual(['d1', 's1'])
    const sharedQ = new URL(global.fetch.mock.calls[0][0]).searchParams.get('q')
    expect(sharedQ).toBe('sharedWithMe = true and trashed = false')
    expect(global.fetch.mock.calls[1][0]).toContain('/drives?')
  })

  it('still lists shared roots when there are no shared drives', async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResp({ files: [{ id: 's1', name: 'Shared folder', mimeType: FOLDER, webViewLink: 'u' }] })
      )
      .mockResolvedValueOnce(jsonResp({ drives: [] }))
    const res = await drive.listFiles('')
    expect(res.files.map(f => f.id)).toEqual(['s1'])
  })
})

describe('getFile - Google-native exports', () => {
  it('reads a Google Doc via text/plain export', async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResp({ id: '1', name: 'Doc', mimeType: DOC, modifiedTime: 't', webViewLink: 'https://drive/1' })
      )
      .mockResolvedValueOnce(textResp('Hello doc'))
    const res = await drive.getFile('1')
    expect(res.content).toBe('Hello doc')
    expect(res.truncated).toBe(false)
    expect(res.url).toBe('https://drive/1')
    expect(global.fetch.mock.calls[1][0]).toContain('/export?mimeType=text%2Fplain')
  })

  it('reads a Google Sheet as CSV with a multi-tab notice', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: '2', name: 'Sheet', mimeType: SHEET, webViewLink: 'u' }))
      .mockResolvedValueOnce(textResp('a,b\n1,2'))
    const res = await drive.getFile('2')
    expect(res.content).toBe('a,b\n1,2')
    expect(res.notice).toMatch(/first sheet/i)
    expect(global.fetch.mock.calls[1][0]).toContain('mimeType=text%2Fcsv')
  })

  it('reads Google Slides via text/plain export', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: '3', name: 'Deck', mimeType: SLIDES, webViewLink: 'u' }))
      .mockResolvedValueOnce(textResp('slide content'))
    const res = await drive.getFile('3')
    expect(res.content).toBe('slide content')
  })
})

describe('getFile - blob types', () => {
  it('reads plain text via alt=media', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: 't', name: 'notes.md', mimeType: 'text/markdown', webViewLink: 'u' }))
      .mockResolvedValueOnce(blobResp(new TextEncoder().encode('# Title\nbody')))
    const res = await drive.getFile('t')
    expect(res.content).toBe('# Title\nbody')
    expect(global.fetch.mock.calls[1][0]).toContain('alt=media')
  })

  it('extracts a digital PDF with mergePages', async () => {
    global.fetch
      .mockResolvedValueOnce(
        jsonResp({ id: 'p', name: 'P.pdf', mimeType: 'application/pdf', size: '100', webViewLink: 'u' })
      )
      .mockResolvedValueOnce(blobResp(new Uint8Array([1, 2, 3])))
    const res = await drive.getFile('p')
    expect(res.content).toBe('PDF text')
    const { extractText } = await import('unpdf')
    expect(extractText).toHaveBeenCalledWith(expect.anything(), { mergePages: true })
  })

  it('returns a scanned notice when PDF extraction is empty', async () => {
    const { extractText } = await import('unpdf')
    extractText.mockResolvedValueOnce({ text: '   ' })
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: 'p', name: 'scan.pdf', mimeType: 'application/pdf', webViewLink: 'u' }))
      .mockResolvedValueOnce(blobResp(new Uint8Array([1, 2, 3])))
    const res = await drive.getFile('p')
    expect(res.content).toBe('')
    expect(res.notice).toMatch(/scanned/i)
  })

  it('reads a .docx via mammoth', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: 'd', name: 'doc.docx', mimeType: DOCX, webViewLink: 'u' }))
      .mockResolvedValueOnce(blobResp(new Uint8Array([1])))
    const res = await drive.getFile('d')
    expect(res.content).toBe('Docx body')
  })

  it('reads a .xlsx via exceljs across sheets', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: 'x', name: 'book.xlsx', mimeType: XLSX, webViewLink: 'u' }))
      .mockResolvedValueOnce(blobResp(new Uint8Array([1])))
    const res = await drive.getFile('x')
    expect(res.content).toBe('# Sheet1\na\tb\n#DIV/0!\t#REF!')
  })

  it('reads a .pptx via jszip + fast-xml-parser without coercing run text', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: 'pp', name: 'deck.pptx', mimeType: PPTX, webViewLink: 'u' }))
      .mockResolvedValueOnce(blobResp(new Uint8Array([1])))
    const res = await drive.getFile('pp')
    expect(res.content).toBe('# Slide 1\nSlide text')
    expect(recorder.xmlOpts).toMatchObject({ parseTagValue: false, trimValues: false })
  })

  it('returns a parse_failed notice when extraction throws (corrupt/encrypted)', async () => {
    const { extractText } = await import('unpdf')
    extractText.mockRejectedValueOnce(new Error('Invalid PDF structure.'))
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: 'bad', name: 'bad.pdf', mimeType: 'application/pdf', webViewLink: 'u' }))
      .mockResolvedValueOnce(blobResp(new Uint8Array([1, 2, 3])))
    const res = await drive.getFile('bad')
    expect(res.error).toBe('parse_failed')
    expect(res.content).toBe('')
  })
})

describe('getFile - notices for unreadable types', () => {
  it('returns a folder notice without downloading', async () => {
    global.fetch.mockResolvedValueOnce(jsonResp({ id: 'fd', name: 'Folder', mimeType: FOLDER, webViewLink: 'u' }))
    const res = await drive.getFile('fd')
    expect(res.notice).toMatch(/folder/i)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('returns a drawing notice', async () => {
    global.fetch.mockResolvedValueOnce(jsonResp({ id: 'dr', name: 'Draw', mimeType: DRAWING, webViewLink: 'u' }))
    const res = await drive.getFile('dr')
    expect(res.notice).toMatch(/drawing/i)
  })

  it('returns an unsupported-type notice', async () => {
    global.fetch.mockResolvedValueOnce(jsonResp({ id: 'i', name: 'pic.png', mimeType: 'image/png', webViewLink: 'u' }))
    const res = await drive.getFile('i')
    expect(res.notice).toMatch(/unsupported/i)
  })
})

describe('getFile - limits and redaction', () => {
  it('truncates at the char ceiling and flags it', async () => {
    mockConfig.google.drive.maxChars = 5
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: '1', name: 'Doc', mimeType: DOC, webViewLink: 'u' }))
      .mockResolvedValueOnce(textResp('abcdefghij'))
    const res = await drive.getFile('1')
    expect(res.content).toBe('abcde')
    expect(res.truncated).toBe(true)
    expect(res.returnedChars).toBe(5)
    expect(res.totalChars).toBe(10)
  })

  it('redacts credential-shaped content', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: '1', name: 'Doc', mimeType: DOC, webViewLink: 'u' }))
      .mockResolvedValueOnce(
        textResp('start -----BEGIN PRIVATE KEY-----\nSECRETKEYMATERIAL\n-----END PRIVATE KEY----- end')
      )
    const res = await drive.getFile('1')
    expect(res.content).toContain('[redacted]')
    expect(res.content).not.toContain('SECRETKEYMATERIAL')
  })

  it('refuses oversized files before downloading (size metadata)', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResp({
        id: 'big',
        name: 'big.pdf',
        mimeType: 'application/pdf',
        size: String(30 * 1024 * 1024),
        webViewLink: 'u',
      })
    )
    const res = await drive.getFile('big')
    expect(res.error).toBe('file_too_large')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('refuses files exceeding the byte cap while streaming (no Content-Length)', async () => {
    mockConfig.google.drive.maxBytes = 5
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: 't', name: 'f.txt', mimeType: 'text/plain', webViewLink: 'u' }))
      .mockResolvedValueOnce(blobResp(new Uint8Array(10)))
    const res = await drive.getFile('t')
    expect(res.error).toBe('file_too_large')
  })

  it('refuses files whose Content-Length exceeds the byte cap', async () => {
    mockConfig.google.drive.maxBytes = 5
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: 't', name: 'f.txt', mimeType: 'text/plain', webViewLink: 'u' }))
      .mockResolvedValueOnce(blobResp(new Uint8Array(3), { contentLength: '999' }))
    const res = await drive.getFile('t')
    expect(res.error).toBe('file_too_large')
  })
})

describe('getFile - failure branches', () => {
  it('maps a 403 export size limit to export_too_large', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: '1', name: 'Doc', mimeType: DOC, webViewLink: 'https://drive/1' }))
      .mockResolvedValueOnce(errResp(403, 'exportSizeLimitExceeded'))
    const res = await drive.getFile('1')
    expect(res.error).toBe('export_too_large')
    expect(res.notice).toContain('https://drive/1')
  })

  it('maps a 403 on metadata to access_denied', async () => {
    global.fetch.mockResolvedValueOnce(errResp(403, 'insufficientFilePermissions'))
    const res = await drive.getFile('x')
    expect(res.error).toBe('access_denied')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('maps a 404 to not_found', async () => {
    global.fetch.mockResolvedValueOnce(errResp(404))
    const res = await drive.getFile('x')
    expect(res.error).toBe('not_found')
  })

  it('maps a 5xx on export to upstream_error', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResp({ id: '1', name: 'Doc', mimeType: DOC, webViewLink: 'u' }))
      .mockResolvedValueOnce(errResp(500, 'backendError'))
    const res = await drive.getFile('1')
    expect(res.error).toBe('upstream_error')
  })
})
