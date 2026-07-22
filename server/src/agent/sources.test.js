import { describe, it, expect } from 'vitest'
import { YOLO_SOURCE, isYoloMode, buildSourcePolicy, collectConsultedSources, buildSourcesFooter } from './sources.js'

describe('isYoloMode', () => {
  it('is true when yolo is in the list', () => {
    expect(isYoloMode([YOLO_SOURCE])).toBe(true)
    expect(isYoloMode(['yolo', 'org/repo'])).toBe(true)
  })

  it('is false for empty or non-array input', () => {
    expect(isYoloMode([])).toBe(false)
    expect(isYoloMode(null)).toBe(false)
    expect(isYoloMode(undefined)).toBe(false)
  })

  it('is false when yolo is not in the list', () => {
    expect(isYoloMode(['org/repo', 'integration:notion'])).toBe(false)
  })
})

describe('buildSourcePolicy', () => {
  it('is unrestricted for yolo, empty, and non-array selections', () => {
    expect(buildSourcePolicy([YOLO_SOURCE]).unrestricted).toBe(true)
    expect(buildSourcePolicy(['yolo', 'org/repo']).unrestricted).toBe(true)
    expect(buildSourcePolicy([]).unrestricted).toBe(true)
    expect(buildSourcePolicy(null).unrestricted).toBe(true)
    expect(buildSourcePolicy(undefined).unrestricted).toBe(true)
  })

  it('is restricted for a specific selection', () => {
    const policy = buildSourcePolicy(['org/repo', 'integration:notion'])
    expect(policy.unrestricted).toBe(false)
  })

  it('splits repos and integrations, stripping the integration prefix', () => {
    const policy = buildSourcePolicy(['org/app', 'org/lib', 'integration:notion', 'integration:google-drive'])
    expect(policy.repos).toEqual(['org/app', 'org/lib'])
    expect(policy.integrations).toEqual(['notion', 'google-drive'])
  })

  it('still reports repos and integrations in yolo mode', () => {
    const policy = buildSourcePolicy(['yolo', 'org/repo', 'integration:postgres'])
    expect(policy.unrestricted).toBe(true)
    expect(policy.repos).toEqual(['org/repo'])
    expect(policy.integrations).toEqual(['postgres'])
  })

  it('ignores non-string entries', () => {
    const policy = buildSourcePolicy(['org/repo', 42, null, { a: 1 }])
    expect(policy.repos).toEqual(['org/repo'])
    expect(policy.unrestricted).toBe(false)
  })
})

describe('collectConsultedSources', () => {
  it('extracts repos from repo-tool arguments', () => {
    const calls = [
      { name: 'search_code', arguments: '{"repo":"org/app","query":"foo"}' },
      { name: 'get_file_contents', arguments: '{"repo":"org/app","path":"a.js"}' },
      { name: 'get_directory_contents', arguments: '{"repo":"org/lib","path":"src"}' },
    ]
    const { repos, integrations } = collectConsultedSources(calls)
    expect(repos).toEqual(['org/app', 'org/lib'])
    expect(integrations).toEqual([])
  })

  it('maps integration tools to their integration name', () => {
    const calls = [
      { name: 'search_notion_pages', arguments: '{}' },
      { name: 'query_database', arguments: '{}' },
      { name: 'get_shopify_order', arguments: '{}' },
      { name: 'search_helpjuice_articles', arguments: '{}' },
      { name: 'get_sentry_issue', arguments: '{}' },
      { name: 'get_shortcut_story', arguments: '{}' },
    ]
    const { integrations } = collectConsultedSources(calls)
    expect(integrations).toEqual(['Notion', 'Database', 'Shopify', 'Helpjuice', 'Sentry', 'Shortcut'])
  })

  it('ignores list_repos discovery calls', () => {
    const calls = [{ name: 'list_repos', arguments: '{}' }]
    const { repos, integrations } = collectConsultedSources(calls)
    expect(repos).toEqual([])
    expect(integrations).toEqual([])
  })

  it('handles malformed arguments gracefully', () => {
    const calls = [
      { name: 'search_code', arguments: 'not-json' },
      { name: 'get_file_contents', arguments: undefined },
    ]
    const { repos } = collectConsultedSources(calls)
    expect(repos).toEqual([])
  })

  it('handles empty input', () => {
    expect(collectConsultedSources([])).toEqual({ repos: [], integrations: [] })
    expect(collectConsultedSources(null)).toEqual({ repos: [], integrations: [] })
  })
})

describe('buildSourcesFooter', () => {
  it('returns empty string when no sources were consulted', () => {
    expect(buildSourcesFooter([])).toBe('')
    expect(buildSourcesFooter([{ name: 'list_repos', arguments: '{}' }])).toBe('')
  })

  it('builds a footer with repos and integrations', () => {
    const calls = [
      { name: 'search_code', arguments: '{"repo":"org/app"}' },
      { name: 'search_notion_pages', arguments: '{}' },
    ]
    const footer = buildSourcesFooter(calls)
    expect(footer).toContain('Sources consulted')
    expect(footer).toContain('`org/app`')
    expect(footer).toContain('Notion')
  })
})
