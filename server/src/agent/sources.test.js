import { describe, it, expect, vi } from 'vitest'
import {
  YOLO_SOURCE,
  isYoloMode,
  buildSourcePolicy,
  collectConsultedSources,
  buildSourcesFooter,
  INTEGRATION_TOOL_NAMES,
  INTEGRATION_WRITE_TOOL_NAMES,
  WRITE_TOOL_NAMES,
  REPO_WRITE_TOOL_NAMES,
  OPEN_PULL_REQUEST_TOOL_NAME,
  hasWriteTools,
  guardRepoSelection,
} from './sources.js'

const HUBSPOT_WRITE_TOOLS = [
  'create_hubspot_record',
  'update_hubspot_record',
  'associate_hubspot_records',
  'archive_hubspot_record',
  'remove_hubspot_association',
  'merge_hubspot_records',
  'update_hubspot_list_membership',
  'reply_hubspot_conversation',
]

describe('INTEGRATION_WRITE_TOOL_NAMES', () => {
  it('lists every write tool inside its integration group, so it can be granted and labelled', () => {
    expect(INTEGRATION_WRITE_TOOL_NAMES.shortcut).toContain('create_shortcut_story')
    expect(INTEGRATION_WRITE_TOOL_NAMES.figma).toEqual(['post_figma_comment'])
    expect(INTEGRATION_WRITE_TOOL_NAMES.zendesk).toEqual(['zendesk_post_internal_note'])
    for (const [id, names] of Object.entries(INTEGRATION_WRITE_TOOL_NAMES)) {
      for (const name of names) expect(INTEGRATION_TOOL_NAMES[id], id).toContain(name)
    }
  })

  it('lists the eight HubSpot write tools after its thirteen read tools', () => {
    expect(INTEGRATION_WRITE_TOOL_NAMES.hubspot).toEqual(HUBSPOT_WRITE_TOOLS)
    expect(INTEGRATION_TOOL_NAMES.hubspot).toHaveLength(21)
    expect(INTEGRATION_TOOL_NAMES.hubspot.slice(13)).toEqual(HUBSPOT_WRITE_TOOLS)
    expect(INTEGRATION_TOOL_NAMES.hubspot.slice(0, 13)).toContain('search_hubspot_records')
  })

  it('counts every HubSpot write tool among the write tools', () => {
    for (const name of HUBSPOT_WRITE_TOOLS) expect(WRITE_TOOL_NAMES, name).toContain(name)
    expect(WRITE_TOOL_NAMES).not.toContain('search_hubspot_records')
  })
})

describe('REPO_WRITE_TOOL_NAMES', () => {
  it('names the tools that change code and open pull requests, ending with open_pull_request', () => {
    expect(REPO_WRITE_TOOL_NAMES).toEqual([
      'edit_file',
      'write_file',
      'delete_file',
      'continue_pull_request',
      'open_pull_request',
    ])
    expect(OPEN_PULL_REQUEST_TOOL_NAME).toBe('open_pull_request')
  })

  it('counts them among the write tools, so read-only runs drop them', () => {
    for (const name of REPO_WRITE_TOOL_NAMES) expect(WRITE_TOOL_NAMES, name).toContain(name)
    expect(WRITE_TOOL_NAMES).not.toContain('get_file_contents')
  })

  it('keeps them out of every integration group', () => {
    const integrationTools = Object.values(INTEGRATION_TOOL_NAMES).flat()

    for (const name of REPO_WRITE_TOOL_NAMES) expect(integrationTools, name).not.toContain(name)
  })
})

describe('guardRepoSelection', () => {
  it('runs the tool for any repo when nothing restricts the selection', async () => {
    const run = vi.fn(async input => `ran on ${input.repo}`)

    const result = await guardRepoSelection(null)(run)({ repo: 'org/any' })

    expect(result).toBe('ran on org/any')
    expect(run).toHaveBeenCalledWith({ repo: 'org/any' })
  })

  it('runs the tool for a selected repo', async () => {
    const run = vi.fn(async () => 'ok')

    expect(await guardRepoSelection(['org/app'])(run)({ repo: 'org/app', path: 'a.js' })).toBe('ok')
    expect(run).toHaveBeenCalledWith({ repo: 'org/app', path: 'a.js' })
  })

  it('refuses a repo outside the selection with the allowed list, without running the tool', async () => {
    const run = vi.fn()

    const result = await guardRepoSelection(['org/app', 'org/web'])(run)({ repo: 'org/other' })

    expect(JSON.parse(result)).toEqual({
      error:
        'Repository "org/other" is not among the sources selected for this conversation. Allowed repositories: org/app, org/web.',
    })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('hasWriteTools', () => {
  it('tells whether any write tool of an integration survived', () => {
    expect(hasWriteTools('shortcut', new Set(['get_shortcut_story', 'add_shortcut_comment']))).toBe(true)
    expect(hasWriteTools('shortcut', new Set(['get_shortcut_story']))).toBe(false)
    expect(hasWriteTools('figma', new Set(['post_figma_comment']))).toBe(true)
    expect(hasWriteTools('figma', new Set())).toBe(false)
  })

  it('tells whether any HubSpot write tool survived', () => {
    expect(hasWriteTools('hubspot', new Set(['search_hubspot_records', 'update_hubspot_record']))).toBe(true)
    expect(hasWriteTools('hubspot', new Set(['search_hubspot_records', 'hubspot_api_get']))).toBe(false)
  })

  it('is false for integrations without write tools', () => {
    expect(hasWriteTools('notion', new Set(['search_notion_pages']))).toBe(false)
  })
})

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
      { name: 'list_databases', arguments: '{}' },
      { name: 'get_shopify_order', arguments: '{}' },
      { name: 'search_helpjuice_articles', arguments: '{}' },
      { name: 'get_sentry_issue', arguments: '{}' },
      { name: 'get_shortcut_story', arguments: '{}' },
      { name: 'get_figma_screenshot', arguments: '{}' },
    ]
    const { integrations } = collectConsultedSources(calls)
    expect(integrations).toEqual(['Notion', 'Database', 'Shopify', 'Helpjuice', 'Sentry', 'Shortcut', 'Figma'])
  })

  it('credits Granola for either of its note tools', () => {
    const calls = [
      { name: 'search_granola_notes', arguments: '{}' },
      { name: 'get_granola_note', arguments: '{"noteId":"not_1"}' },
    ]
    expect(collectConsultedSources(calls).integrations).toEqual(['Granola'])
  })

  it('credits Gmail and Google Calendar for their own tools', () => {
    const calls = [
      { name: 'search_gmail_messages', arguments: '{"query":"from:acme.com"}' },
      { name: 'get_gmail_thread', arguments: '{"threadId":"t1"}' },
      { name: 'list_calendar_events', arguments: '{}' },
      { name: 'query_calendar_free_busy', arguments: '{"emails":["primary"]}' },
    ]

    expect(collectConsultedSources(calls).integrations).toEqual(['Gmail', 'Google Calendar'])
  })

  it('credits Slack for reading channels and threads', () => {
    const calls = [
      { name: 'list_slack_channels', arguments: '{"query":"support"}' },
      { name: 'read_slack_channel', arguments: '{"channel":"#support"}' },
      { name: 'read_slack_thread', arguments: '{"channel":"#support","ts":"1700000000.123456"}' },
    ]

    expect(collectConsultedSources(calls).integrations).toEqual(['Slack'])
    expect(buildSourcesFooter(calls)).toContain('_Sources consulted: Slack_')
  })

  it('credits Better Stack once for any of the log tools', () => {
    const calls = [
      { name: 'list_log_sources', arguments: '{}' },
      { name: 'describe_log_source', arguments: '{"source":"API"}' },
      { name: 'search_logs', arguments: '{"source":"API","query":"boom"}' },
      { name: 'query_logs', arguments: '{"sql":"SELECT 1"}' },
    ]
    expect(collectConsultedSources(calls).integrations).toEqual(['Better Stack'])
  })

  it('credits HubSpot once for its read and write tools', () => {
    const calls = [
      { name: 'search_hubspot_records', arguments: '{"objectType":"contacts"}' },
      { name: 'hubspot_api_get', arguments: '{}' },
      { name: 'reply_hubspot_conversation', arguments: '{"threadId":"1"}' },
    ]

    expect(collectConsultedSources(calls).integrations).toEqual(['HubSpot'])
    expect(buildSourcesFooter(calls)).toContain('_Sources consulted: HubSpot_')
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
