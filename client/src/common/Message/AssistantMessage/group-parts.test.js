import { describe, it, expect } from 'vitest'
import { groupParts } from './group-parts.js'

describe('groupParts', () => {
  it('groups consecutive tool calls into a single step block', () => {
    const parts = [
      { type: 'tool_call', tool: 'list_repos', input: {}, done: true, durationMs: 400 },
      { type: 'tool_call', tool: 'search_code', input: { query: 'refund' }, done: false },
    ]

    expect(groupParts(parts)).toEqual([
      {
        type: 'steps',
        steps: [
          { label: 'Listing repositories', detail: '', duration: '400ms', done: true },
          { label: 'Searching code', detail: '"refund"', duration: '', done: false },
        ],
      },
    ])
  })

  it('starts a new block after a text part', () => {
    const parts = [
      { type: 'tool_call', tool: 'list_repos', input: {}, done: true },
      { type: 'text', content: 'Found them.' },
      { type: 'tool_call', tool: 'search_code', input: {}, done: true },
    ]

    const groups = groupParts(parts)

    expect(groups.map(group => group.type)).toEqual(['steps', 'text', 'steps'])
    expect(groups[0].steps).toHaveLength(1)
    expect(groups[2].steps).toHaveLength(1)
  })

  it('leaves other parts untouched', () => {
    const parts = [
      { type: 'text', content: 'Hello' },
      { type: 'error', content: 'Broke.' },
    ]

    expect(groupParts(parts)).toEqual(parts)
  })

  it('returns nothing for an empty message', () => {
    expect(groupParts([])).toEqual([])
  })
})
