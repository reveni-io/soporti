import { describe, it, expect } from 'vitest'
import { UNKNOWN_TOOL, toolCallsFromResult, toolNames, toolNamesFromResult } from './run-items.js'

describe('toolCallsFromResult', () => {
  it('returns the name and arguments of each tool call in order', () => {
    const result = {
      newItems: [
        { type: 'tool_call_item', rawItem: { name: 'search_code', arguments: '{"q":"pool"}' } },
        { type: 'message_output_item', rawItem: { name: 'ignored' } },
        { type: 'tool_call_item', rawItem: { name: 'get_file_contents', arguments: '{}' } },
      ],
    }

    expect(toolCallsFromResult(result)).toEqual([
      { name: 'search_code', arguments: '{"q":"pool"}' },
      { name: 'get_file_contents', arguments: '{}' },
    ])
  })

  it('returns an empty array when there are no items', () => {
    expect(toolCallsFromResult(undefined)).toEqual([])
    expect(toolCallsFromResult({})).toEqual([])
  })
})

describe('toolNames', () => {
  it('keeps the names of the calls in order', () => {
    expect(toolNames([{ name: 'search_code' }, { name: 'get_file_contents' }])).toEqual([
      'search_code',
      'get_file_contents',
    ])
  })

  it('drops the calls whose name never arrived so no channel records a fake tool', () => {
    expect(toolNames([{ name: 'search_code' }, {}, { name: UNKNOWN_TOOL }, null])).toEqual(['search_code'])
  })

  it('returns an empty array when there are no calls', () => {
    expect(toolNames(undefined)).toEqual([])
  })
})

describe('toolNamesFromResult', () => {
  it('returns the names of the tool calls in order', () => {
    const result = {
      newItems: [
        { type: 'tool_call_item', rawItem: { name: 'search_code' } },
        { type: 'message_output_item', rawItem: { name: 'ignored' } },
        { type: 'tool_call_item', rawItem: { name: 'get_file_contents' } },
      ],
    }

    expect(toolNamesFromResult(result)).toEqual(['search_code', 'get_file_contents'])
  })

  it('drops tool calls without a name', () => {
    const result = { newItems: [{ type: 'tool_call_item', rawItem: {} }] }

    expect(toolNamesFromResult(result)).toEqual([])
  })

  it('returns an empty array when there are no items', () => {
    expect(toolNamesFromResult(undefined)).toEqual([])
    expect(toolNamesFromResult({})).toEqual([])
  })
})
