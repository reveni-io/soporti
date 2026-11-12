import { describe, it, expect } from 'vitest'
import { parsePrompt, parseText } from './input.js'

describe('parseText', () => {
  it('returns the trimmed text', () => {
    expect(parseText('  Returns overview ', { noun: 'name', maxLength: 80 })).toEqual({ value: 'Returns overview' })
  })

  it('accepts a text that is exactly at the limit', () => {
    expect(parseText('n'.repeat(80), { noun: 'name', maxLength: 80 })).toEqual({ value: 'n'.repeat(80) })
  })

  it.each([
    { kind: 'a missing value', value: undefined },
    { kind: 'null', value: null },
    { kind: 'a blank text', value: '   ' },
    { kind: 'a number', value: 42 },
  ])('asks for the text when given $kind', ({ value }) => {
    expect(parseText(value, { noun: 'name', maxLength: 80 })).toEqual({ error: 'Write a name.' })
  })

  it('rejects a text over the limit, naming it and the limit', () => {
    expect(parseText('n'.repeat(81), { noun: 'name', maxLength: 80 })).toEqual({
      error: 'The name is too long (max 80 characters).',
    })
  })
})

describe('parsePrompt', () => {
  it('accepts a prompt of up to 2000 characters', () => {
    expect(parsePrompt(` ${'p'.repeat(2000)} `, 'question')).toEqual({ value: 'p'.repeat(2000) })
  })

  it('rejects a longer prompt with the noun of the caller', () => {
    expect(parsePrompt('p'.repeat(2001), 'change request')).toEqual({
      error: 'The change request is too long (max 2000 characters).',
    })
    expect(parsePrompt('', 'question')).toEqual({ error: 'Write a question.' })
  })
})
