import { describe, it, expect } from 'vitest'
import { describeToolCall } from './tool-steps.js'

describe('describeToolCall', () => {
  it('labels a known tool', () => {
    expect(describeToolCall({ tool: 'search_sentry_issues', input: {} }).label).toBe('Searching Sentry')
  })

  it('humanizes an unknown tool name', () => {
    expect(describeToolCall({ tool: 'inspect_widget_state', input: {} }).label).toBe('Inspect widget state')
  })

  it('falls back to a generic label without a tool name', () => {
    expect(describeToolCall({ tool: undefined, input: {} }).label).toBe('Working')
  })

  it('formats a repository path', () => {
    expect(
      describeToolCall({ tool: 'get_file_contents', input: { repo: 'org/app', path: 'src/index.js' } }).detail
    ).toBe('org/app/src/index.js')
  })

  it('formats a repository without a path', () => {
    expect(describeToolCall({ tool: 'get_directory_contents', input: { repo: 'org/app' } }).detail).toBe('org/app/')
  })

  it('formats a query scoped to a repository', () => {
    expect(describeToolCall({ tool: 'search_code', input: { repo: 'org/app', query: 'refund' } }).detail).toBe(
      '"refund" in org/app'
    )
  })

  it('formats a query without a repository', () => {
    expect(describeToolCall({ tool: 'search_logs', input: { query: 'timeout' } }).detail).toBe('"timeout"')
  })

  it('formats a bare path', () => {
    expect(describeToolCall({ tool: 'get_drive_file', input: { path: 'Docs/spec' } }).detail).toBe('Docs/spec')
  })

  it('leaves the detail empty without an input', () => {
    expect(describeToolCall({ tool: 'list_repos', input: null }).detail).toBe('')
  })

  it('formats a sub-second duration in milliseconds', () => {
    expect(describeToolCall({ tool: 'list_repos', durationMs: 840 }).duration).toBe('840ms')
  })

  it('formats a longer duration in seconds', () => {
    expect(describeToolCall({ tool: 'list_repos', durationMs: 1240 }).duration).toBe('1.2s')
  })

  it('leaves the duration empty while the tool runs', () => {
    expect(describeToolCall({ tool: 'list_repos' }).duration).toBe('')
  })

  it('reports whether the call finished', () => {
    expect(describeToolCall({ tool: 'list_repos', done: true }).done).toBe(true)
    expect(describeToolCall({ tool: 'list_repos' }).done).toBe(false)
  })
})

describe('describeToolCall nesting', () => {
  it('marks a step a specialist ran as nested', () => {
    expect(describeToolCall({ tool: 'search_code', parent: 'ask_code_reviewer' }).nested).toBe(true)
  })

  it('leaves a step the main agent ran flat', () => {
    expect(describeToolCall({ tool: 'search_code' }).nested).toBe(false)
    expect(describeToolCall({ tool: 'search_code', parent: null }).nested).toBe(false)
  })
})
