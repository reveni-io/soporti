import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseCsv, downloadCsv } from './csv.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseCsv', () => {
  it('parses a header and its rows', () => {
    expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('keeps commas and newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"one, two","line\nbreak"')).toEqual([
      ['a', 'b'],
      ['one, two', 'line\nbreak'],
    ])
  })

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([['a'], ['say "hi"']])
  })

  it('ignores carriage returns', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('keeps empty fields', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
  })

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('downloadCsv', () => {
  it('downloads the csv as a file and releases the url', () => {
    const createObjectURL = vi.fn(() => 'blob:csv')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi.fn()
    const anchor = document.createElement('a')
    anchor.click = click
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    downloadCsv('a,b\n1,2')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(anchor.download).toBe('soporti-export.csv')
    expect(anchor.href).toContain('blob:csv')
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv')
    expect(document.body.contains(anchor)).toBe(false)

    vi.unstubAllGlobals()
  })
})
