import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useArtifact } from './useArtifact.js'

const ARTIFACT_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

const ARTIFACT = {
  id: ARTIFACT_ID,
  identifier: 'refund-dashboard',
  title: 'Refund dashboard',
  latestVersion: 2,
  versions: [1, 2],
}

beforeEach(() => {
  vi.restoreAllMocks()
})

function mockFetch(html = '<h1>Refunds</h1>', version = 2) {
  return vi.fn().mockImplementation(url => {
    if (url.includes('/html')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ version, html }) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ artifact: ARTIFACT }) })
  })
}

describe('useArtifact', () => {
  it('loads the metadata and the html for the given id', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.artifact).toEqual(ARTIFACT)
    expect(result.current.html).toBe('<h1>Refunds</h1>')
  })

  it('does not fetch without a token or an id', () => {
    global.fetch = vi.fn()

    renderHook(() => useArtifact(null, ARTIFACT_ID, vi.fn()))
    renderHook(() => useArtifact('tok', null, vi.fn()))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('asks for the latest version when none is given', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(global.fetch.mock.calls.every(([url]) => !url.includes('version='))).toBe(true)
  })

  it('fetches the opened version once, without a throwaway request for the latest first', async () => {
    global.fetch = mockFetch('<h1>v3</h1>', 3)

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn(), 3))

    await waitFor(() => expect(result.current.html).toBe('<h1>v3</h1>'))

    const htmlCalls = global.fetch.mock.calls.filter(([url]) => url.includes('/html'))
    expect(htmlCalls).toHaveLength(1)
    expect(htmlCalls[0][0]).toContain('version=3')
  })

  it('refetches the version list when the agent publishes a newer version', async () => {
    global.fetch = mockFetch()

    const { result, rerender } = renderHook(({ opened }) => useArtifact('tok', ARTIFACT_ID, vi.fn(), opened), {
      initialProps: { opened: 2 },
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    const metaCallsBefore = global.fetch.mock.calls.filter(([url]) => !url.includes('/html')).length

    rerender({ opened: 3 })

    await waitFor(() => {
      const metaCallsAfter = global.fetch.mock.calls.filter(([url]) => !url.includes('/html')).length
      expect(metaCallsAfter).toBeGreaterThan(metaCallsBefore)
    })
  })

  it('drops a version the user picked on a different artifact, so no stale version is requested', async () => {
    global.fetch = mockFetch()

    const { result, rerender } = renderHook(({ id }) => useArtifact('tok', id, vi.fn()), {
      initialProps: { id: ARTIFACT_ID },
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.selectVersion(3))
    await waitFor(() => expect(result.current.version).toBe(3))

    rerender({ id: '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e02' })

    expect(result.current.version).toBeNull()
    expect(
      global.fetch.mock.calls.some(([url]) => url.includes('/7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e02/html?version=3'))
    ).toBe(false)
  })

  it('drops a version the user picked before the agent republished', async () => {
    global.fetch = mockFetch()

    const { result, rerender } = renderHook(({ opened }) => useArtifact('tok', ARTIFACT_ID, vi.fn(), opened), {
      initialProps: { opened: 2 },
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.selectVersion(1))
    await waitFor(() => expect(result.current.version).toBe(1))

    rerender({ opened: 3 })

    expect(result.current.version).toBe(3)
  })

  it('does not refetch the metadata when only the version changes', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    const metaCallsBefore = global.fetch.mock.calls.filter(([url]) => !url.includes('/html')).length

    act(() => result.current.selectVersion(1))
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url.includes('version=1'))).toBe(true))

    const metaCallsAfter = global.fetch.mock.calls.filter(([url]) => !url.includes('/html')).length
    expect(metaCallsAfter).toBe(metaCallsBefore)
  })

  it('starts on the version it was handed', async () => {
    global.fetch = mockFetch('<h1>v1</h1>', 1)

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn(), 1))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(global.fetch.mock.calls.some(([url]) => url.includes('version=1'))).toBe(true)
  })

  it('refetches when the user picks another version', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.selectVersion(1))

    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url.includes('version=1'))).toBe(true))
  })

  it('keeps the loaded html across a version switch, so the panel does not blank out', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn()))

    await waitFor(() => expect(result.current.html).toBe('<h1>Refunds</h1>'))
    act(() => result.current.selectVersion(1))

    expect(result.current.html).toBe('<h1>Refunds</h1>')
  })

  it('clears the content when the id changes, so a stale artifact never flashes', async () => {
    global.fetch = mockFetch()

    const { result, rerender } = renderHook(({ id }) => useArtifact('tok', id, vi.fn()), {
      initialProps: { id: ARTIFACT_ID },
    })

    await waitFor(() => expect(result.current.html).toBe('<h1>Refunds</h1>'))

    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    rerender({ id: '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e02' })

    expect(result.current.html).toBe('')
    expect(result.current.artifact).toBeNull()
  })

  it('resets to the newly published version when it changes', async () => {
    global.fetch = mockFetch('<h1>v3</h1>', 3)

    const { result, rerender } = renderHook(
      ({ initialVersion }) => useArtifact('tok', ARTIFACT_ID, vi.fn(), initialVersion),
      {
        initialProps: { initialVersion: 2 },
      }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ initialVersion: 3 })

    await waitFor(() => expect(result.current.version).toBe(3))
    expect(global.fetch.mock.calls.some(([url]) => url.includes('version=3'))).toBe(true)
  })

  it('does not refetch when the caller passes a fresh callback on every render', async () => {
    global.fetch = mockFetch()

    const { result, rerender } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn()))

    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsAfterLoad = global.fetch.mock.calls.length

    rerender()
    rerender()

    expect(global.fetch.mock.calls).toHaveLength(callsAfterLoad)
  })

  it('deletes a version and lands on the latest one left', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ latestVersion: 1 }) })
      }
      if (url.includes('/html')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ version: 2, html: '<h1>Refunds</h1>' }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ artifact: ARTIFACT }) })
    })

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.removeVersion(2))

    const deleteCall = global.fetch.mock.calls.find(([, options]) => options?.method === 'DELETE')
    expect(deleteCall[0]).toContain(`/api/artifacts/${ARTIFACT_ID}/versions/2`)
    expect(result.current.artifact.versions).toEqual([1])
    await waitFor(() => expect(result.current.version).toBe(1))
  })

  it('surfaces a delete failure without touching the version list', async () => {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve({
          ok: false,
          status: 422,
          json: async () => ({ error: 'Cannot delete the only version. Delete the artifact instead.' }),
        })
      }
      if (url.includes('/html')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ version: 2, html: '<h1>Refunds</h1>' }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ artifact: ARTIFACT }) })
    })

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.removeVersion(2))

    expect(result.current.deleteError).toBe('Cannot delete the only version. Delete the artifact instead.')
    expect(result.current.artifact.versions).toEqual([1, 2])
  })

  it('logs the user out when the delete hits a 401, with no error rendered', async () => {
    const onAuthError = vi.fn()
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (options?.method === 'DELETE') {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized.' }) })
      }
      if (url.includes('/html')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ version: 2, html: '<h1>Refunds</h1>' }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ artifact: ARTIFACT }) })
    })

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, onAuthError))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.removeVersion(2))

    expect(onAuthError).toHaveBeenCalledTimes(1)
    expect(result.current.deleteError).toBe('')
  })

  it('logs the user out on a 401 instead of showing an error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onAuthError = vi.fn()

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, onAuthError))

    await waitFor(() => expect(onAuthError).toHaveBeenCalled())
    expect(result.current.error).toBe('')
  })

  it('surfaces a load failure', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Artifact not found.' }) })

    const { result } = renderHook(() => useArtifact('tok', ARTIFACT_ID, vi.fn()))

    await waitFor(() => expect(result.current.error).toBe('Artifact not found.'))
  })
})
