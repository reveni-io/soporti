import { describe, it, expect } from 'vitest'
import { stripHtml } from './html.js'

describe('stripHtml', () => {
  it('removes tags and keeps their text', () => {
    expect(stripHtml('<p>Welcome to <strong>Helpjuice</strong>!</p>')).toBe('Welcome to Helpjuice!')
  })

  it('removes tags that carry attributes and self-closing tags', () => {
    expect(stripHtml('<a href="https://example.com" target="_blank">Link</a><br/>text<img src="x.png" />')).toBe(
      'Linktext'
    )
  })

  it('decodes the common html entities', () => {
    expect(stripHtml('a&nbsp;b')).toBe('a b')
    expect(stripHtml('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(stripHtml('1 &lt; 2')).toBe('1 < 2')
    expect(stripHtml('3 &gt; 2')).toBe('3 > 2')
    expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"')
    expect(stripHtml('it&#39;s')).toBe("it's")
  })

  it('decodes every occurrence of an entity', () => {
    expect(stripHtml('a &amp; b &amp; c')).toBe('a & b & c')
  })

  it('keeps escaped markup as text instead of stripping it', () => {
    expect(stripHtml('<p>&lt;div&gt;</p>')).toBe('<div>')
  })

  it('collapses whitespace runs into single spaces and trims the ends', () => {
    expect(stripHtml('  <p>first\n\n line</p>\t<p>second   line</p>  ')).toBe('first line second line')
  })

  it('returns an empty string for empty input', () => {
    expect(stripHtml('')).toBe('')
    expect(stripHtml(null)).toBe('')
    expect(stripHtml(undefined)).toBe('')
  })

  it('returns an empty string when the html holds only tags and whitespace', () => {
    expect(stripHtml('<p> </p>\n<br/>')).toBe('')
  })
})
