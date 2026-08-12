import { describe, it, expect } from 'vitest'

import { describeToolCall } from './task-labels.js'

describe('describeToolCall', () => {
  it('returns a human label and the relevant argument', () => {
    expect(describeToolCall('get_file_contents', JSON.stringify({ repo: 'org/repo', path: 'src/auth.js' }))).toEqual({
      title: 'Reading file',
      details: 'src/auth.js',
    })
  })

  it('picks the argument configured for each tool', () => {
    expect(describeToolCall('search_notion_pages', JSON.stringify({ query: 'refund policy' }))).toEqual({
      title: 'Searching Notion',
      details: 'refund policy',
    })
    expect(describeToolCall('describe_database_table', JSON.stringify({ schema: 'public', table: 'orders' }))).toEqual({
      title: 'Describing table',
      details: 'orders',
    })
  })

  it('omits details for tools whose arguments should not be shown', () => {
    expect(describeToolCall('query_database', JSON.stringify({ sql: 'SELECT secret FROM users' }))).toEqual({
      title: 'Querying the database',
    })
    expect(describeToolCall('shopify_graphql_query', JSON.stringify({ query: '{ orders { id } }' }))).toEqual({
      title: 'Querying Shopify',
    })
  })

  it('falls back to the raw tool name when the tool is unknown', () => {
    expect(describeToolCall('some_new_tool', '{}')).toEqual({ title: 'some_new_tool' })
  })

  it('omits details when the argument is missing, empty or unparseable', () => {
    expect(describeToolCall('search_code', JSON.stringify({ repo: 'org/repo' }))).toEqual({ title: 'Searching code' })
    expect(describeToolCall('search_code', JSON.stringify({ query: '' }))).toEqual({ title: 'Searching code' })
    expect(describeToolCall('search_code', 'not json')).toEqual({ title: 'Searching code' })
    expect(describeToolCall('search_code', undefined)).toEqual({ title: 'Searching code' })
  })

  it('stringifies non-string arguments', () => {
    expect(describeToolCall('get_shortcut_story', JSON.stringify({ id: 1234 }))).toEqual({
      title: 'Reading Shortcut story',
      details: '1234',
    })
  })

  it('truncates details longer than the limit', () => {
    const result = describeToolCall('search_code', JSON.stringify({ query: 'x'.repeat(120) }))

    expect(result.details).toHaveLength(80)
    expect(result.details.endsWith('…')).toBe(true)
  })
})
