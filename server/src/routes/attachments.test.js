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

vi.mock('../db/attachment-images.js', () => ({
  createAttachmentImage: vi.fn(),
  getAttachmentPreview: vi.fn(),
  setAttachmentImageThumbnail: vi.fn(),
}))

const { parsePdf, parseDocx } = await import('../documents/parsers.js')
const { createAttachmentImage, getAttachmentPreview, setAttachmentImageThumbnail } =
  await import('../db/attachment-images.js')
const { default: attachmentsRouter } = await import('./attachments.js')
const { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_CHARS } = await import('../constants.js')

const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PNG = 'image/png'
const IMAGE_ID = '11111111-1111-4111-8111-111111111111'
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02])
const THUMBNAIL = 'data:image/webp;base64,dGh1bWI='

describe('attachments routes', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    createAttachmentImage.mockResolvedValue({ id: IMAGE_ID, expiresAt: new Date('2026-09-11T00:00:00Z') })
    setAttachmentImageThumbnail.mockResolvedValue(true)
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
    expect(res.body.error).toMatch(/\.pdf, \.docx, \.xlsx, \.png, \.jpg, \.jpeg, \.webp, \.gif/)
  })

  it('stores an uploaded image and returns its id instead of text', async () => {
    const res = await request(app).post('/?name=error.png').set('Content-Type', PNG).send(PNG_BYTES)

    expect(res.status).toBe(200)
    expect(res.body.attachment).toEqual({ name: 'error.png', imageId: IMAGE_ID })
    expect(createAttachmentImage).toHaveBeenCalledWith({
      userId: 1,
      name: 'error.png',
      mimeType: PNG,
      buffer: PNG_BYTES,
    })
    expect(parsePdf).not.toHaveBeenCalled()
  })

  it('accepts a .jpeg name for a jpeg upload', async () => {
    const res = await request(app)
      .post('/?name=photo.jpeg')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))

    expect(res.status).toBe(200)
    expect(res.body.attachment.imageId).toBe(IMAGE_ID)
  })

  it('returns 422 when the bytes do not match the declared image type', async () => {
    const res = await request(app).post('/?name=fake.png').set('Content-Type', PNG).send(Buffer.from('not an image'))

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/not a valid image/i)
    expect(createAttachmentImage).not.toHaveBeenCalled()
  })

  it('returns 500 when the image cannot be stored', async () => {
    createAttachmentImage.mockRejectedValue(new Error('db down'))

    const res = await request(app).post('/?name=error.png').set('Content-Type', PNG).send(PNG_BYTES)

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/Failed to read the file/)
  })

  it('serves a stored image by id, cached privately', async () => {
    getAttachmentPreview.mockResolvedValue(`data:${PNG};base64,aGk=`)

    const res = await request(app).get(`/images/${IMAGE_ID}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ image: `data:${PNG};base64,aGk=` })
    expect(res.headers['cache-control']).toBe('private, max-age=86400, immutable')
    expect(getAttachmentPreview).toHaveBeenCalledWith(IMAGE_ID, 1)
  })

  it('never puts the stored file name in the image response', async () => {
    getAttachmentPreview.mockResolvedValue(`data:${PNG};base64,aGk=`)

    const res = await request(app).get(`/images/${IMAGE_ID}`)

    expect(res.body).not.toHaveProperty('name')
  })

  it('saves a thumbnail for an image the user owns', async () => {
    const res = await request(app).put(`/images/${IMAGE_ID}/thumbnail`).send({ thumbnail: THUMBNAIL })

    expect(res.status).toBe(200)
    expect(setAttachmentImageThumbnail).toHaveBeenCalledWith(IMAGE_ID, 1, THUMBNAIL)
  })

  it('returns 404 when the thumbnail targets an image the user does not own', async () => {
    setAttachmentImageThumbnail.mockResolvedValue(false)

    const res = await request(app).put(`/images/${IMAGE_ID}/thumbnail`).send({ thumbnail: THUMBNAIL })

    expect(res.status).toBe(404)
  })

  it('rejects a thumbnail that is not a data URI of a supported image', async () => {
    const notADataUri = await request(app)
      .put(`/images/${IMAGE_ID}/thumbnail`)
      .send({ thumbnail: 'https://evil/x.png' })
    const svg = await request(app)
      .put(`/images/${IMAGE_ID}/thumbnail`)
      .send({ thumbnail: 'data:image/svg+xml;base64,PHN2Zz4=' })
    const missing = await request(app).put(`/images/${IMAGE_ID}/thumbnail`).send({})

    expect(notADataUri.status).toBe(400)
    expect(svg.status).toBe(400)
    expect(missing.status).toBe(400)
    expect(setAttachmentImageThumbnail).not.toHaveBeenCalled()
  })

  it('rejects a thumbnail larger than the cap', async () => {
    const huge = `data:image/webp;base64,${'A'.repeat(40_001)}`

    const res = await request(app).put(`/images/${IMAGE_ID}/thumbnail`).send({ thumbnail: huge })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/too large/i)
    expect(setAttachmentImageThumbnail).not.toHaveBeenCalled()
  })

  it('rejects a malformed image id on the thumbnail route', async () => {
    const res = await request(app).put('/images/not-a-uuid/thumbnail').send({ thumbnail: THUMBNAIL })

    expect(res.status).toBe(400)
    expect(setAttachmentImageThumbnail).not.toHaveBeenCalled()
  })

  it('returns 500 when the thumbnail cannot be saved', async () => {
    setAttachmentImageThumbnail.mockRejectedValue(new Error('db down'))

    const res = await request(app).put(`/images/${IMAGE_ID}/thumbnail`).send({ thumbnail: THUMBNAIL })

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/Failed to save the thumbnail/)
  })

  it('returns 404 for an image that expired or belongs to someone else', async () => {
    getAttachmentPreview.mockResolvedValue(null)

    const res = await request(app).get(`/images/${IMAGE_ID}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })

  it('rejects a malformed image id', async () => {
    const res = await request(app).get('/images/not-a-uuid')

    expect(res.status).toBe(400)
    expect(getAttachmentPreview).not.toHaveBeenCalled()
  })

  it('returns 500 when loading the image fails', async () => {
    getAttachmentPreview.mockRejectedValue(new Error('db down'))

    const res = await request(app).get(`/images/${IMAGE_ID}`)

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/Failed to load the image/)
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
