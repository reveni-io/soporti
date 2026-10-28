import { describe, it, expect, vi } from 'vitest'
import { applyToolDescriptions } from './tool-overrides.js'

describe('applyToolDescriptions', () => {
  it('replaces the description of the named tools and keeps everything else', () => {
    const invoke = vi.fn()
    const searchCode = { name: 'search_code', description: 'Search code.', invoke }
    const readFile = { name: 'get_file_contents', description: 'Read a file.', invoke }

    const [overridden, untouched] = applyToolDescriptions([searchCode, readFile], { search_code: 'Find code fast.' })

    expect(overridden).toEqual({ name: 'search_code', description: 'Find code fast.', invoke })
    expect(searchCode.description).toBe('Search code.')
    expect(untouched).toBe(readFile)
  })

  it('returns the same list when there is nothing to override', () => {
    const tools = [{ name: 'search_code', description: 'Search code.' }]

    expect(applyToolDescriptions(tools, null)).toBe(tools)
  })

  it.each([
    { kind: 'an empty map', descriptions: {} },
    { kind: 'a name no tool has', descriptions: { search_logs: 'Find logs.' } },
    { kind: 'an empty description', descriptions: { search_code: '' } },
  ])('leaves every tool as it is for $kind', ({ descriptions }) => {
    const searchCode = { name: 'search_code', description: 'Search code.' }

    expect(applyToolDescriptions([searchCode], descriptions)).toEqual([searchCode])
  })

  it('returns an empty list for no tools', () => {
    expect(applyToolDescriptions([], { search_code: 'Find code.' })).toEqual([])
  })
})
