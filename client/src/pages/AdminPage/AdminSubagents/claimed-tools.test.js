import { describe, it, expect } from 'vitest'
import { claimedBy, claimedToolNames, isGroupSelected, selectableTools, toggleGroupTools } from './claimed-tools.js'

function subagent(overrides) {
  return { id: 1, name: 'code_investigator', tools: ['search_code'], exclusive: true, enabled: true, ...overrides }
}

describe('claimedBy', () => {
  it('maps every tool of an exclusive subagent to its owner', () => {
    expect(claimedBy([subagent({ tools: ['search_code', 'find_files'] })])).toEqual({
      search_code: 'code_investigator',
      find_files: 'code_investigator',
    })
  })

  it('ignores a shared subagent', () => {
    expect(claimedBy([subagent({ exclusive: false })])).toEqual({})
  })

  it('ignores a disabled subagent', () => {
    expect(claimedBy([subagent({ enabled: false })])).toEqual({})
  })

  it('ignores the subagent being edited so it keeps its own tools', () => {
    expect(claimedBy([subagent({})], 1)).toEqual({})
  })
})

describe('claimedToolNames', () => {
  it('collects the claimed tools as a set', () => {
    const claimed = claimedToolNames([subagent({}), subagent({ id: 2, tools: ['search_code', 'get_sentry_issue'] })])

    expect([...claimed].sort()).toEqual(['get_sentry_issue', 'search_code'])
  })

  it('is empty when nothing is claimed', () => {
    expect(claimedToolNames([]).size).toBe(0)
  })
})

const GROUP = { id: 'repo', tools: ['search_code', 'find_files', 'git_blame'] }

describe('selectableTools', () => {
  it('leaves out the tools an exclusive subagent already owns', () => {
    expect(selectableTools(GROUP, { find_files: 'code_investigator' })).toEqual(['search_code', 'git_blame'])
  })
})

describe('isGroupSelected', () => {
  it('is true once every selectable tool is picked, even with one taken away', () => {
    expect(isGroupSelected(GROUP, { find_files: 'code_investigator' }, ['search_code', 'git_blame'])).toBe(true)
  })

  it('is false while a selectable tool is missing', () => {
    expect(isGroupSelected(GROUP, {}, ['search_code', 'git_blame'])).toBe(false)
  })

  it('is false when every tool of the group is taken away', () => {
    const owners = { search_code: 'a', find_files: 'a', git_blame: 'a' }

    expect(isGroupSelected(GROUP, owners, [])).toBe(false)
  })
})

describe('toggleGroupTools', () => {
  it('adds every selectable tool when the group is not fully picked', () => {
    expect(toggleGroupTools(['search_code'], GROUP, {})).toEqual(['search_code', 'find_files', 'git_blame'])
  })

  it('clears a group whose remaining tools are all picked even though one is taken away', () => {
    const owners = { find_files: 'code_investigator' }

    expect(toggleGroupTools(['search_code', 'git_blame', 'get_sentry_issue'], GROUP, owners)).toEqual([
      'get_sentry_issue',
    ])
  })

  it('never adds a tool an exclusive subagent owns', () => {
    expect(toggleGroupTools([], GROUP, { find_files: 'code_investigator' })).toEqual(['search_code', 'git_blame'])
  })
})
