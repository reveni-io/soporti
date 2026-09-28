import { describe, it, expect } from 'vitest'
import { buildSnippet, toContainsPattern } from './conversation-search.js'

describe('toContainsPattern', () => {
  it('wraps the query so it matches anywhere in the text', () => {
    expect(toContainsPattern('refund')).toBe('%refund%')
  })

  it('escapes the like wildcards and the escape character so they match literally', () => {
    expect(toContainsPattern('50%_off\\now')).toBe('%50\\%\\_off\\\\now%')
  })
})

describe('buildSnippet', () => {
  it('returns a short text whole', () => {
    expect(buildSnippet('We checked the refund window', 'refund')).toBe('We checked the refund window')
  })

  it('cuts a long text around the match and marks both cuts', () => {
    const text = `${'a'.repeat(100)} the refund window ${'b'.repeat(100)}`

    const snippet = buildSnippet(text, 'refund')

    expect(snippet).toBe(`…${'a'.repeat(35)} the refund window ${'b'.repeat(32)}…`)
  })

  it('does not mark a cut before a match near the start', () => {
    const snippet = buildSnippet(`Refund issued. ${'b'.repeat(100)}`, 'refund')

    expect(snippet.startsWith('Refund issued.')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('locates the match regardless of case', () => {
    const snippet = buildSnippet(`${'a'.repeat(100)} REFUND`, 'refund')

    expect(snippet).toBe(`…${'a'.repeat(39)} REFUND`)
  })

  it('flattens line breaks and repeated spaces into single spaces', () => {
    expect(buildSnippet('## Refunds\n\n  issued   within 14 days', 'issued')).toBe('## Refunds issued within 14 days')
  })

  it('falls back to the start of the text when the match cannot be located', () => {
    const snippet = buildSnippet(`refund  window ${'b'.repeat(100)}`, 'refund  window')

    expect(snippet.startsWith('refund window')).toBe(true)
  })
})
