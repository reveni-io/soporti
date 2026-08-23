import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useArtifactList } from './useArtifactList.js'

const ARTIFACT_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

const ARTIFACTS = [{ id: ARTIFACT_ID, title: 'Refund dashboard', latestVersion: 3, updatedAt: '2026-08-20T10:00:00Z' }]

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useArtifactList', () => {
  it('loads the artifacts with the auth header', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ artifacts: ARTIFACTS }) })

    const { result } = renderHook(() => useArtifactList('tok', vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.artifacts).toEqual(ARTIFACTS)
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toContain('/api/artifacts')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('does not fetch without a token', () => {
    global.fetch = vi.fn()

    renderHook(() => useArtifactList(null, vi.fn()))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('falls back to an empty list when the payload carries none', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    const { result } = renderHook(() => useArtifactList('tok', vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.artifacts).toEqual([])
  })

  it('calls onUnauthorized on a 401 and reports no error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onUnauthorized = vi.fn()

    const { result } = renderHook(() => useArtifactList('tok', onUnauthorized))

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('surfaces a load failure', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Failed to load your artifacts.' }) })

    const { result } = renderHook(() => useArtifactList('tok', vi.fn()))

    await waitFor(() => expect(result.current.error).toBe('Failed to load your artifacts.'))
  })

  it('clears a previous error on reload', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Failed.' }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ artifacts: ARTIFACTS }) })

    const { result } = renderHook(() => useArtifactList('tok', vi.fn()))

    await waitFor(() => expect(result.current.error).toBe('Failed.'))

    await act(async () => {
      await result.current.reload()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.artifacts).toEqual(ARTIFACTS)
  })

  it('does not refetch when the caller passes a fresh callback on every render', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ artifacts: ARTIFACTS }) })

    const { result, rerender } = renderHook(() => useArtifactList('tok', vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsAfterLoad = global.fetch.mock.calls.length

    rerender()
    rerender()

    expect(global.fetch.mock.calls).toHaveLength(callsAfterLoad)
  })
})
