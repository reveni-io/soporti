import { describe, it, expect } from 'vitest'
import { parseCsv } from './parsers.js'

describe('parsers', () => {
  describe('parseCsv', () => {
    it('returns the csv text with its rows intact', async () => {
      const csv = 'order_id,customer,total\n1001,"Doe, Jane",49.90\n1002,Ana Núñez,12.00'

      expect(await parseCsv(Buffer.from(csv))).toBe(csv)
    })

    it('drops the byte order mark that spreadsheet exports prepend', async () => {
      const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('id,total\n1,2')])

      expect(await parseCsv(buffer)).toBe('id,total\n1,2')
    })

    it('stops at the character budget', async () => {
      expect(await parseCsv(Buffer.from('a,b,c,d'), 3)).toBe('a,b')
    })

    it('rejects a binary file renamed to .csv', async () => {
      await expect(parseCsv(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).rejects.toThrow('not a text file')
    })
  })
})
