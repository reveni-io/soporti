import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config.js', () => ({
  default: { documents: { parseConcurrency: 2, parseTimeoutMs: 20 } },
}))

vi.mock('./parsers.js', () => ({
  parsePdf: vi.fn(),
  parseDocx: vi.fn(),
  parseXlsx: vi.fn(),
}))

const { parsePdf, parseDocx, parseXlsx } = await import('./parsers.js')
const { extractAttachmentText, isSupportedAttachment, isValidAttachmentName } = await import('./attachments.js')
const { MAX_ATTACHMENT_CHARS } = await import('../constants.js')

const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

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
    })

    it('rejects an unsupported mime type and a mime type the extension contradicts', () => {
      expect(isSupportedAttachment('deck.pptx', 'application/vnd.ms-powerpoint')).toBe(false)
      expect(isSupportedAttachment('invoice.exe', PDF)).toBe(false)
      expect(isSupportedAttachment('sheet.xlsx', DOCX)).toBe(false)
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

      expect((await extractAttachmentText(Buffer.from('d'), DOCX)).text).toBe('Docx body')
      expect((await extractAttachmentText(Buffer.from('x'), XLSX)).text).toBe('Xlsx body')
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
