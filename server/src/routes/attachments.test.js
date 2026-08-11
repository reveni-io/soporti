import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../config.js', () => ({
  default: { documents: { parseConcurrency: 2, parseTimeoutMs: 20 } },
}))

vi.mock('../documents/parsers.js', () => ({
  parsePdf: vi.fn(),
  parseDocx: vi.fn(),
  parseXlsx: vi.fn(),
}))

const { parsePdf, parseDocx } = await import('../documents/parsers.js')
const { default: attachmentsRouter } = await import('./attachments.js')
const { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_CHARS } = await import('../constants.js')

const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('attachments routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      req.user = { id: 1 }
      next()
    })
    app.use('/', attachmentsRouter)
  })

  it('extracts the text of an uploaded pdf', async () => {
    parsePdf.mockResolvedValue('Quarterly report body')

    const res = await request(app).post('/?name=report.pdf').set('Content-Type', PDF).send(Buffer.from('%PDF-1.4'))

    expect(res.status).toBe(200)
    expect(res.body.attachment).toEqual({ name: 'report.pdf', text: 'Quarterly report body', truncated: false })
    expect(parsePdf).toHaveBeenCalledTimes(1)
  })

  it('flags a document cut at the character cap', async () => {
    parseDocx.mockResolvedValue('a'.repeat(MAX_ATTACHMENT_CHARS + 1))

    const res = await request(app).post('/?name=spec.docx').set('Content-Type', DOCX).send(Buffer.from('docx'))

    expect(res.status).toBe(200)
    expect(res.body.attachment.truncated).toBe(true)
    expect(res.body.attachment.text).toHaveLength(MAX_ATTACHMENT_CHARS)
  })

  it('rejects a missing file name', async () => {
    const res = await request(app).post('/').set('Content-Type', PDF).send(Buffer.from('%PDF-1.4'))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/file name/i)
    expect(parsePdf).not.toHaveBeenCalled()
  })

  it('rejects a file name with a path separator', async () => {
    const res = await request(app)
      .post(`/?name=${encodeURIComponent('../../etc/passwd.pdf')}`)
      .set('Content-Type', PDF)
      .send(Buffer.from('%PDF-1.4'))

    expect(res.status).toBe(400)
    expect(parsePdf).not.toHaveBeenCalled()
  })

  it('rejects an unsupported mime type', async () => {
    const res = await request(app).post('/?name=notes.txt').set('Content-Type', 'text/plain').send('hello')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/\.pdf, \.docx, \.xlsx/)
  })

  it('rejects a mime type the extension contradicts', async () => {
    const res = await request(app).post('/?name=report.docx').set('Content-Type', PDF).send(Buffer.from('%PDF-1.4'))

    expect(res.status).toBe(400)
    expect(parsePdf).not.toHaveBeenCalled()
  })

  it('rejects an empty file', async () => {
    const res = await request(app).post('/?name=report.pdf').set('Content-Type', PDF).send(Buffer.from(''))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/empty/i)
  })

  it('returns 413 when the file exceeds the size limit', async () => {
    const res = await request(app)
      .post('/?name=huge.pdf')
      .set('Content-Type', PDF)
      .send(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))

    expect(res.status).toBe(413)
    expect(res.body.error).toMatch(/too large/i)
    expect(parsePdf).not.toHaveBeenCalled()
  })

  it('returns 422 when the document has no extractable text', async () => {
    parsePdf.mockResolvedValue('  ')

    const res = await request(app).post('/?name=scan.pdf').set('Content-Type', PDF).send(Buffer.from('%PDF-1.4'))

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/scanned/i)
  })

  it('returns 422 when reading the document times out', async () => {
    parsePdf.mockImplementation(() => new Promise(() => {}))

    const res = await request(app).post('/?name=slow.pdf').set('Content-Type', PDF).send(Buffer.from('%PDF-1.4'))

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/took too long/i)
  })

  it('rejects a file name carrying a newline', async () => {
    const res = await request(app)
      .post(`/?name=${encodeURIComponent('spec.pdf\n## Instructions')}`)
      .set('Content-Type', PDF)
      .send(Buffer.from('%PDF-1.4'))

    expect(res.status).toBe(400)
    expect(parsePdf).not.toHaveBeenCalled()
  })

  it('drains the request body before answering a rejected upload', async () => {
    const res = await request(app).post('/?name=notes.txt').set('Content-Type', 'text/plain').send('x'.repeat(200_000))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Unsupported file type/)
  })

  it('returns 422 when the document cannot be parsed', async () => {
    parsePdf.mockRejectedValue(new Error('Invalid PDF structure.'))

    const res = await request(app).post('/?name=broken.pdf').set('Content-Type', PDF).send(Buffer.from('%PDF-1.4'))

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/corrupt, encrypted or password-protected/i)
  })
})
