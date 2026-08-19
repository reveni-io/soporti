import { describe, it, expect } from 'vitest'
import { buildUserTurn } from './user-turn.js'

const CASE = { question: 'Why does it 500?', answer: 'The token had expired.', score: 0.88 }

describe('buildUserTurn', () => {
  it('returns the message unchanged when there is nothing to prepend', () => {
    expect(buildUserTurn('why does it 500?')).toBe('why does it 500?')
    expect(buildUserTurn('why does it 500?', {})).toBe('why does it 500?')
    expect(buildUserTurn('why does it 500?', { similarCases: [], commands: [] })).toBe('why does it 500?')
  })

  it('puts the cases section first and the labelled question last', () => {
    const result = buildUserTurn('why is the refund stuck?', { similarCases: [CASE] })

    expect(result).toContain('## Similar resolved cases')
    expect(result).toContain('The token had expired.')
    expect(result).toContain("## The user's question")
    expect(result.endsWith('why is the refund stuck?')).toBe(true)
    expect(result.indexOf('## Similar resolved cases')).toBeLessThan(result.indexOf("## The user's question"))
  })

  it('labels the question so the case question cannot be mistaken for it', () => {
    const result = buildUserTurn('why is the refund stuck?', { similarCases: [CASE] })

    expect(result).toContain('Asked: Why does it 500?')
    expect(result).toContain('This, and only this, is what the user asked')
    expect(result.indexOf('Asked: Why does it 500?')).toBeLessThan(result.indexOf('why is the refund stuck?'))
  })

  it('separates the cases section from the question', () => {
    const result = buildUserTurn('why does it 500?', { similarCases: [CASE] })

    expect(result).toContain("\n\n---\n\n## The user's question")
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

  it('includes the attached documents before the question', () => {
    const result = buildUserTurn('summarize the API section', {
      attachments: [{ name: 'spec.pdf', text: 'The API returns 402 on expired tokens.', truncated: false }],
    })

    expect(result).toContain('## Attached documents')
    expect(result).toContain('### spec.pdf')
    expect(result).toContain('The API returns 402 on expired tokens.')
    expect(result.endsWith('\n\nsummarize the API section')).toBe(true)
  })

  it('marks a truncated document', () => {
    const result = buildUserTurn('summarize it', {
      attachments: [{ name: 'huge.xlsx', text: 'rows...', truncated: true }],
    })

    expect(result).toContain('### huge.xlsx (truncated)')
  })

  it('keeps the cases first, the documents next and the question last', () => {
    const result = buildUserTurn('why does it 500?', {
      similarCases: [CASE],
      attachments: [{ name: 'spec.pdf', text: 'body', truncated: false }],
    })

    expect(result.indexOf('## Similar resolved cases')).toBeLessThan(result.indexOf('## Attached documents'))
    expect(result.indexOf('## Attached documents')).toBeLessThan(result.indexOf("## The user's question"))
  })

  it('names an attached image without inlining any bytes', () => {
    const result = buildUserTurn('what is this error?', {
      attachments: [{ name: 'error.png', imageId: '22222222-2222-4222-8222-222222222222' }],
    })

    expect(result).toContain('## Attached images')
    expect(result).toContain('- error.png')
    expect(result).not.toContain('## Attached documents')
    expect(result).not.toContain('22222222-2222-4222-8222-222222222222')
    expect(result.endsWith('\n\nwhat is this error?')).toBe(true)
  })

  it('describes documents and images in their own sections', () => {
    const result = buildUserTurn('does the screenshot match the spec?', {
      attachments: [
        { name: 'spec.pdf', text: 'The API returns 402.', truncated: false },
        { name: 'error.png', imageId: '22222222-2222-4222-8222-222222222222' },
      ],
    })

    expect(result.indexOf('## Attached documents')).toBeLessThan(result.indexOf('## Attached images'))
    expect(result).toContain('### spec.pdf')
    expect(result).toContain('- error.png')
  })

  it('ignores an empty attachments list', () => {
    expect(buildUserTurn('hello', { attachments: [] })).toBe('hello')
    expect(buildUserTurn('hello', { attachments: null })).toBe('hello')
  })
})
