import { describe, it, expect } from 'vitest'
import { buildUserTurn } from './user-turn.js'

const CASE = { question: 'Why does it 500?', answer: 'The token had expired.' }

describe('buildUserTurn', () => {
  it('returns the message unchanged when there is nothing to prepend', () => {
    expect(buildUserTurn('why does it 500?')).toBe('why does it 500?')
    expect(buildUserTurn('why does it 500?', {})).toBe('why does it 500?')
    expect(buildUserTurn('why does it 500?', { similarCases: [], commands: [] })).toBe('why does it 500?')
  })

  it('puts the cases section first and the question last', () => {
    const result = buildUserTurn('why does it 500?', { similarCases: [CASE] })

    expect(result).toContain('## Similar resolved cases')
    expect(result).toContain('The token had expired.')
    expect(result.endsWith('why does it 500?')).toBe(true)
    expect(result.indexOf('## Similar resolved cases')).toBeLessThan(result.indexOf('why does it 500?'))
  })

  it('separates the cases section from the question', () => {
    const result = buildUserTurn('why does it 500?', { similarCases: [CASE] })

    expect(result).toContain('\n\n---\n\nwhy does it 500?')
  })

  it('prepends each invoked command to the question', () => {
    const result = buildUserTurn('the last commit of returns-frontend', { commands: ['code-review', 'read-hu'] })

    expect(result).toBe('/code-review /read-hu the last commit of returns-frontend')
  })

  it('prefixes the commands on the question, not on the cases block', () => {
    const result = buildUserTurn('the last commit of returns-frontend', {
      similarCases: [CASE],
      commands: ['code-review'],
    })

    expect(result).toContain('## Similar resolved cases')
    expect(result.endsWith('/code-review the last commit of returns-frontend')).toBe(true)
    expect(result.indexOf('/code-review')).toBeGreaterThan(result.indexOf('## Similar resolved cases'))
  })

  it('ignores a missing similar cases list', () => {
    expect(buildUserTurn('hello', { similarCases: null })).toBe('hello')
    expect(buildUserTurn('hello', { similarCases: undefined })).toBe('hello')
  })
})
