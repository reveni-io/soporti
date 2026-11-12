import { describe, it, expect } from 'vitest'
import { shortenText } from './text.js'

describe('shortenText', () => {
  it('collapses whitespace and trims a text that fits', () => {
    expect(shortenText('  Returns\n per   week ', 120)).toBe('Returns per week')
  })

  it('keeps a text that is exactly at the limit', () => {
    expect(shortenText('a'.repeat(10), 10)).toBe('a'.repeat(10))
  })

  it('cuts a longer text and ends it with an ellipsis within the limit', () => {
    const shortened = shortenText(`${'word '.repeat(10)}tail`, 20)

    expect(shortened).toBe('word word word word…')
    expect(shortened.length).toBeLessThanOrEqual(20)
  })

  it('returns an empty string for a blank text', () => {
    expect(shortenText(' \n ', 10)).toBe('')
  })
})
