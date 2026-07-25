import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSourceSearch } from './useSourceSearch.js'

const REPOS = [
  { fullName: 'org/app', description: 'Main app', language: 'JavaScript' },
  { fullName: 'org/lib', description: 'Library', language: 'TypeScript' },
  { fullName: 'org/bare' },
]

const INTEGRATIONS = [
  { id: 'github', name: 'GitHub', description: 'Explore repositories', selectable: false },
  { id: 'notion', name: 'Notion', description: 'Search Notion', selectable: true },
]

describe('useSourceSearch', () => {
  it('returns every selectable source when the search is empty', () => {
    const { result } = renderHook(() => useSourceSearch({ repos: REPOS, integrations: INTEGRATIONS }))

    expect(result.current.filteredRepos).toHaveLength(3)
    expect(result.current.filteredIntegrations).toEqual([INTEGRATIONS[1]])
    expect(result.current.yoloMatches).toBe(true)
  })

  it('matches repos on name, description and language, case-insensitively', () => {
    const { result } = renderHook(() => useSourceSearch({ repos: REPOS, integrations: INTEGRATIONS }))

    act(() => result.current.setSearch('TYPEscript'))
    expect(result.current.filteredRepos.map(repo => repo.fullName)).toEqual(['org/lib'])

    act(() => result.current.setSearch('main'))
    expect(result.current.filteredRepos.map(repo => repo.fullName)).toEqual(['org/app'])

    act(() => result.current.setSearch('org/bare'))
    expect(result.current.filteredRepos.map(repo => repo.fullName)).toEqual(['org/bare'])
  })

  it('matches integrations on name and description', () => {
    const { result } = renderHook(() => useSourceSearch({ repos: REPOS, integrations: INTEGRATIONS }))

    act(() => result.current.setSearch('search notion'))

    expect(result.current.filteredIntegrations).toEqual([INTEGRATIONS[1]])
  })

  it('never offers a non-selectable integration, even when it matches', () => {
    const { result } = renderHook(() => useSourceSearch({ repos: REPOS, integrations: INTEGRATIONS }))

    act(() => result.current.setSearch('github'))

    expect(result.current.filteredIntegrations).toEqual([])
  })

  it('keeps the yolo entry only while the query is a prefix of yolo or auto', () => {
    const { result } = renderHook(() => useSourceSearch({ repos: REPOS, integrations: INTEGRATIONS }))

    act(() => result.current.setSearch('yo'))
    expect(result.current.yoloMatches).toBe(true)

    act(() => result.current.setSearch('aut'))
    expect(result.current.yoloMatches).toBe(true)

    act(() => result.current.setSearch('typescript'))
    expect(result.current.yoloMatches).toBe(false)
  })
})
