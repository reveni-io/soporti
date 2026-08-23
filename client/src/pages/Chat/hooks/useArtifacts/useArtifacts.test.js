import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useArtifacts } from './useArtifacts.js'

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

describe('useArtifacts', () => {
  it('does not fetch anything until an artifact is opened', () => {
    global.fetch = vi.fn()

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    expect(result.current.openId).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('loads the metadata and the html when the user opens a card', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    act(() => result.current.openArtifact(ARTIFACT_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.openId).toBe(ARTIFACT_ID)
    expect(result.current.artifact).toEqual(ARTIFACT)
    expect(result.current.html).toBe('<h1>Refunds</h1>')
  })

  it('sends the auth token on every request', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    act(() => result.current.openArtifact(ARTIFACT_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    for (const [, options] of global.fetch.mock.calls) {
      expect(options.headers.Authorization).toBe('Bearer tok')
    }
  })

  it('opens a card on the latest version, asking for no specific one', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    act(() => result.current.openArtifact(ARTIFACT_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(global.fetch.mock.calls.every(([url]) => !url.includes('version='))).toBe(true)
  })

  it('opens a published artifact straight on the published version, with no throwaway request', async () => {
    global.fetch = mockFetch('<h1>v3</h1>', 3)

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    act(() => result.current.openPublished({ artifactId: ARTIFACT_ID, title: 'Refunds', version: 3 }))
    await waitFor(() => expect(result.current.html).toBe('<h1>v3</h1>'))

    expect(result.current.openId).toBe(ARTIFACT_ID)
    expect(result.current.version).toBe(3)
    const htmlCalls = global.fetch.mock.calls.filter(([url]) => url.includes('/html'))
    expect(htmlCalls).toHaveLength(1)
    expect(htmlCalls[0][0]).toContain('version=3')
  })

  it('moves to the newer version when the agent iterates on the open artifact', async () => {
    global.fetch = mockFetch('<h1>v4</h1>', 4)

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    act(() => result.current.openPublished({ artifactId: ARTIFACT_ID, title: 'Refunds', version: 3 }))
    await waitFor(() => expect(result.current.version).toBe(3))

    act(() => result.current.openPublished({ artifactId: ARTIFACT_ID, title: 'Refunds', version: 4 }))

    await waitFor(() => expect(result.current.version).toBe(4))
    expect(global.fetch.mock.calls.some(([url]) => url.includes('version=4'))).toBe(true)
  })

  it('opens a card on the latest version even after a publish selected an older one', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    act(() => result.current.openPublished({ artifactId: ARTIFACT_ID, title: 'Refunds', version: 1 }))
    await waitFor(() => expect(result.current.version).toBe(1))

    act(() => result.current.openArtifact(ARTIFACT_ID))

    await waitFor(() => {
      const htmlCalls = global.fetch.mock.calls.filter(([url]) => url.includes('/html'))
      expect(htmlCalls).toHaveLength(2)
      expect(htmlCalls.at(-1)[0]).not.toContain('version=')
    })
    await waitFor(() => expect(result.current.version).toBe(2))
  })

  it('requests the version the user picks', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    act(() => result.current.openArtifact(ARTIFACT_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.selectVersion(1))
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url.includes('version=1'))).toBe(true))
  })

  it('clears the panel on close', async () => {
    global.fetch = mockFetch()

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    act(() => result.current.openArtifact(ARTIFACT_ID))
    await waitFor(() => expect(result.current.html).toBe('<h1>Refunds</h1>'))

    act(() => result.current.close())

    expect(result.current.openId).toBeNull()
    expect(result.current.artifact).toBeNull()
    expect(result.current.html).toBe('')
  })

  it('logs the user out on a 401 instead of showing an error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    const onAuthError = vi.fn()

    const { result } = renderHook(() => useArtifacts('tok', onAuthError))

    act(() => result.current.openArtifact(ARTIFACT_ID))
    await waitFor(() => expect(onAuthError).toHaveBeenCalled())

    expect(result.current.error).toBe('')
  })

  it('surfaces a load failure', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Failed to load the artifact.' }) })

    const { result } = renderHook(() => useArtifacts('tok', vi.fn()))

    act(() => result.current.openArtifact(ARTIFACT_ID))
    await waitFor(() => expect(result.current.error).toBe('Failed to load the artifact.'))
  })

  it('keeps stable open callbacks so the memoized message list is not re-rendered', () => {
    global.fetch = vi.fn()

    const { result, rerender } = renderHook(() => useArtifacts('tok', vi.fn()))
    const { openArtifact, openPublished } = result.current

    rerender()

    expect(result.current.openArtifact).toBe(openArtifact)
    expect(result.current.openPublished).toBe(openPublished)
  })
})
