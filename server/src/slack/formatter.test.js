import { describe, it, expect } from 'vitest'
import { markdownToSlack, splitMessage } from './formatter.js'

describe('markdownToSlack', () => {
  it('returns empty string for falsy input', () => {
    expect(markdownToSlack('')).toBe('')
    expect(markdownToSlack(null)).toBe('')
    expect(markdownToSlack(undefined)).toBe('')
  })

  it('converts bold **text** to *text*', () => {
    expect(markdownToSlack('This is **bold** text')).toBe('This is *bold* text')
  })

  it('converts strikethrough ~~text~~ to ~text~', () => {
    expect(markdownToSlack('This is ~~deleted~~ text')).toBe('This is ~deleted~ text')
  })

  it('converts markdown links to Slack format', () => {
    expect(markdownToSlack('[Click here](https://example.com)')).toBe('<https://example.com|Click here>')
  })

  it('converts headings to bold text', () => {
    expect(markdownToSlack('# Title')).toBe('*Title*')
    expect(markdownToSlack('## Subtitle')).toBe('*Subtitle*')
    expect(markdownToSlack('### Section')).toBe('*Section*')
  })

  it('strips language tag from code blocks', () => {
    const input = '```javascript\nconst x = 1;\n```'
    expect(markdownToSlack(input)).toBe('```const x = 1;\n```')
  })

  it('removes mermaid code blocks', () => {
    const input = 'Before\n```mermaid\nflowchart TD\n    A --> B\n```\nAfter'
    expect(markdownToSlack(input)).toBe('Before\n_[diagram omitted]_\nAfter')
  })

  it('converts images to Slack links (link regex matches first, leaving !)', () => {
    expect(markdownToSlack('![alt text](https://img.png)')).toBe('!<https://img.png|alt text>')
  })

  it('preserves inline code', () => {
    expect(markdownToSlack('Use `npm install`')).toBe('Use `npm install`')
  })

  it('trims whitespace', () => {
    expect(markdownToSlack('  hello  ')).toBe('hello')
  })
})

describe('splitMessage', () => {
  it('returns single chunk if within limit', () => {
    const text = 'Short message'
    expect(splitMessage(text)).toEqual([text])
  })

  it('returns single chunk if exactly at limit', () => {
    const text = 'a'.repeat(3000)
    expect(splitMessage(text)).toEqual([text])
  })

  it('splits at paragraph boundary', () => {
    const p1 = 'a'.repeat(2000)
    const p2 = 'b'.repeat(2000)
    const text = `${p1}\n\n${p2}`
    const chunks = splitMessage(text)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toBe(p1)
    expect(chunks[1]).toBe(p2)
  })

  it('splits at line boundary as fallback', () => {
    const line1 = 'a'.repeat(2500)
    const line2 = 'b'.repeat(2500)
    const text = `${line1}\n${line2}`
    const chunks = splitMessage(text)
    expect(chunks.length).toBe(2)
  })

  it('splits at space as fallback', () => {
    const word1 = 'a'.repeat(2500)
    const word2 = 'b'.repeat(2500)
    const text = `${word1} ${word2}`
    const chunks = splitMessage(text)
    expect(chunks.length).toBe(2)
  })

  it('hard-splits as last resort', () => {
    const text = 'a'.repeat(6000)
    const chunks = splitMessage(text)
    expect(chunks.length).toBe(2)
    expect(chunks[0].length).toBe(3000)
  })

  it('respects custom maxLength', () => {
    const text = 'a'.repeat(20)
    const chunks = splitMessage(text, 10)
    expect(chunks.length).toBe(2)
  })

  it('trims leading whitespace on subsequent chunks', () => {
    const p1 = 'a'.repeat(2000)
    const p2 = 'b'.repeat(2000)
    const text = `${p1}\n\n   ${p2}`
    const chunks = splitMessage(text)
    expect(chunks[1]).toBe(p2)
  })
})
