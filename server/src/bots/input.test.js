import { describe, it, expect } from 'vitest'
import { parseRequiredText } from './input.js'

const NAME = { label: 'The name', maxLength: 5 }

describe('parseRequiredText', () => {
  it('returns the trimmed text', () => {
    expect(parseRequiredText('  Ana  ', NAME)).toEqual({ value: 'Ana' })
  })

  it('requires some text', () => {
    expect(parseRequiredText('   ', NAME)).toEqual({ error: 'The name is required.' })
    expect(parseRequiredText(undefined, NAME)).toEqual({ error: 'The name is required.' })
    expect(parseRequiredText(42, NAME)).toEqual({ error: 'The name is required.' })
  })

  it('measures the length after trimming', () => {
    expect(parseRequiredText('  Maria  ', NAME)).toEqual({ value: 'Maria' })
    expect(parseRequiredText('Mariana', NAME)).toEqual({ error: 'The name is too long (max 5 characters).' })
  })
})
