import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSkills } from './useSkills.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockList(skills = []) {
  return { ok: true, status: 200, json: async () => ({ skills }) }
}

describe('useSkills', () => {
  it('loads the skills with the auth header', async () => {
    global.fetch = vi.fn().mockResolvedValue(mockList([{ id: 1, name: 'bug-triage' }]))

    const { result } = renderHook(() => useSkills('tok', vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.skills).toEqual([{ id: 1, name: 'bug-triage' }])
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/skills')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('does not fetch without a token', () => {
    global.fetch = vi.fn()

    renderHook(() => useSkills(null, vi.fn()))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('calls onUnauthorized on a 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onUnauthorized = vi.fn()

    renderHook(() => useSkills('tok', onUnauthorized))

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled())
  })

  it('exposes an error when the load fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })

    const { result } = renderHook(() => useSkills('tok', vi.fn()))

    await waitFor(() => expect(result.current.error).toBe('Failed to load skills'))
  })

  it('refetches on reload', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(mockList([]))
      .mockResolvedValueOnce(mockList([{ id: 2, name: 'qa' }]))

    const { result } = renderHook(() => useSkills('tok', vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.skills).toEqual([{ id: 2, name: 'qa' }])
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
