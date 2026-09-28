import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config.js', () => ({
  default: { documents: { parseConcurrency: 2, parseTimeoutMs: 20 } },
}))

vi.mock('./parsers.js', () => ({
  parsePdf: vi.fn(),
  parseDocx: vi.fn(),
  parseXlsx: vi.fn(),
  parseCsv: vi.fn(),
}))

const { parsePdf, parseDocx, parseXlsx, parseCsv } = await import('./parsers.js')
const { extractAttachmentText, isImageAttachment, isSupportedAttachment, isValidAttachmentName, looksLikeImage } =
  await import('./attachments.js')
const { MAX_ATTACHMENT_CHARS } = await import('../constants.js')

const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const CSV = 'text/csv'
const PNG = 'image/png'
const JPEG = 'image/jpeg'
const WEBP = 'image/webp'
const GIF = 'image/gif'

describe('attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isValidAttachmentName', () => {
    it('accepts an ordinary file name', () => {
      expect(isValidAttachmentName('Q3 report (final).pdf')).toBe(true)
    })

    it('rejects names carrying newlines, tabs or path separators', () => {
      expect(isValidAttachmentName('spec.pdf\n## Instructions')).toBe(false)
      expect(isValidAttachmentName('spec\tname.pdf')).toBe(false)
      expect(isValidAttachmentName('../../etc/passwd.pdf')).toBe(false)
      expect(isValidAttachmentName('dir\\file.pdf')).toBe(false)
    })

    it('rejects an empty name and a non-string', () => {
      expect(isValidAttachmentName('   ')).toBe(false)
      expect(isValidAttachmentName(undefined)).toBe(false)
    })
  })

  describe('supported types', () => {
    it('accepts a name whose extension matches the mime type, whatever its case', () => {
      expect(isSupportedAttachment('spec.pdf', PDF)).toBe(true)
      expect(isSupportedAttachment('REQUIREMENTS.DOCX', DOCX)).toBe(true)
      expect(isSupportedAttachment('sales.xlsx', XLSX)).toBe(true)
      expect(isSupportedAttachment('orders.CSV', CSV)).toBe(true)
    })

    it('rejects an unsupported mime type and a mime type the extension contradicts', () => {
      expect(isSupportedAttachment('deck.pptx', 'application/vnd.ms-powerpoint')).toBe(false)
      expect(isSupportedAttachment('invoice.exe', PDF)).toBe(false)
      expect(isSupportedAttachment('sheet.xlsx', DOCX)).toBe(false)
      expect(isSupportedAttachment('orders.txt', CSV)).toBe(false)
    })

    it('accepts the image types, with either extension for a jpeg', () => {
      expect(isSupportedAttachment('error.png', PNG)).toBe(true)
      expect(isSupportedAttachment('photo.jpg', JPEG)).toBe(true)
      expect(isSupportedAttachment('photo.JPEG', JPEG)).toBe(true)
      expect(isSupportedAttachment('shot.webp', WEBP)).toBe(true)
      expect(isSupportedAttachment('loop.gif', GIF)).toBe(true)
      expect(isSupportedAttachment('error.png', JPEG)).toBe(false)
    })
  })

  describe('isImageAttachment', () => {
    it('separates the image types from the document types', () => {
      expect(isImageAttachment(PNG)).toBe(true)
      expect(isImageAttachment(GIF)).toBe(true)
      expect(isImageAttachment(PDF)).toBe(false)
      expect(isImageAttachment('text/plain')).toBe(false)
    })
  })

  describe('looksLikeImage', () => {
    it('accepts bytes carrying the signature of their declared type', () => {
      expect(looksLikeImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), PNG)).toBe(true)
      expect(looksLikeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), JPEG)).toBe(true)
      expect(looksLikeImage(Buffer.from('GIF89a and more'), GIF)).toBe(true)
      expect(looksLikeImage(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 '), WEBP)).toBe(true)
    })

    it('rejects bytes that do not match the declared type', () => {
      expect(looksLikeImage(Buffer.from('<html>hello</html>'), PNG)).toBe(false)
      expect(looksLikeImage(Buffer.from([0x89, 0x50, 0x4e, 0x47]), JPEG)).toBe(false)
      expect(looksLikeImage(Buffer.from('RIFF\x00\x00\x00\x00AVI LIST'), WEBP)).toBe(false)
      expect(looksLikeImage(Buffer.from(''), PNG)).toBe(false)
    })

    it('rejects a document mime type', () => {
      expect(looksLikeImage(Buffer.from('%PDF-1.4'), PDF)).toBe(false)
    })
  })

  describe('extractAttachmentText', () => {
    it('extracts a pdf with its parser and trims the result', async () => {
      parsePdf.mockResolvedValue('  Quarterly report  ')

      const result = await extractAttachmentText(Buffer.from('pdf'), PDF)

      expect(result).toEqual({ text: 'Quarterly report', truncated: false })
      expect(parsePdf).toHaveBeenCalledWith(Buffer.from('pdf'), MAX_ATTACHMENT_CHARS * 2)
    })

    it('routes each mime type to its own parser', async () => {
      parseDocx.mockResolvedValue('Docx body')
      parseXlsx.mockResolvedValue('Xlsx body')
      parseCsv.mockResolvedValue('id,total')

      expect((await extractAttachmentText(Buffer.from('d'), DOCX)).text).toBe('Docx body')
      expect((await extractAttachmentText(Buffer.from('x'), XLSX)).text).toBe('Xlsx body')
      expect((await extractAttachmentText(Buffer.from('c'), CSV)).text).toBe('id,total')
      expect(parsePdf).not.toHaveBeenCalled()
    })

    it('redacts secrets found in the document', async () => {
      parseDocx.mockResolvedValue('token ghp_0123456789abcdefghijklmnopqrstuvwxyz end')

      const { text } = await extractAttachmentText(Buffer.from('d'), DOCX)

      expect(text).not.toContain('ghp_0123456789abcdefghijklmnopqrstuvwxyz')
      expect(text).toContain('end')
    })

    it('truncates at the character cap and flags it', async () => {
      parseXlsx.mockResolvedValue('a'.repeat(MAX_ATTACHMENT_CHARS + 500))

      const result = await extractAttachmentText(Buffer.from('x'), XLSX)

      expect(result.truncated).toBe(true)
      expect(result.text).toHaveLength(MAX_ATTACHMENT_CHARS)
    })

    it('gives the parser a character budget so a huge document is bounded while extracting', async () => {
      parseXlsx.mockResolvedValue('rows')

      await extractAttachmentText(Buffer.from('x'), XLSX)

      expect(parseXlsx).toHaveBeenCalledWith(Buffer.from('x'), MAX_ATTACHMENT_CHARS * 2)
    })

    it('does not flag a document as truncated when only trailing whitespace exceeded the cap', async () => {
      parsePdf.mockResolvedValue('a'.repeat(MAX_ATTACHMENT_CHARS - 100) + ' '.repeat(300))

      const result = await extractAttachmentText(Buffer.from('pdf'), PDF)

      expect(result.truncated).toBe(false)
      expect(result.text).toHaveLength(MAX_ATTACHMENT_CHARS - 100)
    })

    it('reports a timeout when the parser hangs, without holding the slot', async () => {
      parsePdf.mockImplementation(() => new Promise(() => {}))

      const result = await extractAttachmentText(Buffer.from('pdf'), PDF)

      expect(result).toEqual({ error: 'timeout' })

      parsePdf.mockResolvedValue('Later upload')
      expect((await extractAttachmentText(Buffer.from('pdf'), PDF)).text).toBe('Later upload')
    })

    it('reports an empty document when nothing could be extracted', async () => {
      parsePdf.mockResolvedValue('   ')

      expect(await extractAttachmentText(Buffer.from('pdf'), PDF)).toEqual({ error: 'empty' })
    })

    it('reports a parse failure when the parser throws', async () => {
      parsePdf.mockRejectedValue(new Error('Invalid PDF structure.'))

      expect(await extractAttachmentText(Buffer.from('pdf'), PDF)).toEqual({ error: 'parse_failed' })
    })
  })
})
