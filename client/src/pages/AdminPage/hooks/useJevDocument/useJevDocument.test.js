import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useJevDocument } from './useJevDocument.js'

const SAVED = { id: 'legal', rev: 2, data: { set: { description: 'Old' } }, setVersion: 1 }

function respond(status, body) {
  return { ok: status < 400, status, json: async () => body }
}

const stableLogout = vi.fn()

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useJevDocument', () => {
  it('loads the document and tracks the draft against it', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(200, SAVED))

    const { result } = renderHook(() => useJevDocument('tok', 'legal', stableLogout))
    await waitFor(() => expect(result.current.document).toEqual(SAVED))

    expect(result.current.dirty).toBe(false)

    act(() => result.current.updateDraft(draft => ({ set: { ...draft.set, description: 'New' } })))

    expect(result.current.draft).toEqual({ set: { description: 'New' } })
    expect(result.current.dirty).toBe(true)
  })

  it('saves the draft against the loaded revision', async () => {
    const saved = { ...SAVED, rev: 3, data: { set: { description: 'New' } } }
    global.fetch = vi.fn().mockResolvedValueOnce(respond(200, SAVED)).mockResolvedValueOnce(respond(200, saved))

    const { result } = renderHook(() => useJevDocument('tok', 'legal', stableLogout))
    await waitFor(() => expect(result.current.document).not.toBeNull())
    act(() => result.current.updateDraft({ set: { description: 'New' } }))
    await act(() => result.current.save())

    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
      rev: 2,
      data: { set: { description: 'New' } },
      restoredFrom: null,
    })
    expect(result.current.document).toEqual(saved)
    expect(result.current.dirty).toBe(false)
    expect(result.current.savedAt).toEqual(expect.any(Number))
  })

  it('sends the restored version with the next save and forgets it after', async () => {
    const saved = { ...SAVED, rev: 3, setVersion: 2 }
    global.fetch = vi.fn().mockResolvedValueOnce(respond(200, SAVED)).mockResolvedValueOnce(respond(200, saved))

    const { result } = renderHook(() => useJevDocument('tok', 'legal', stableLogout))
    await waitFor(() => expect(result.current.document).not.toBeNull())
    act(() => result.current.restore(1, draft => ({ set: { ...draft.set, description: 'From v1' } })))

    expect(result.current.restoredFrom).toBe(1)
    expect(result.current.draft).toEqual({ set: { description: 'From v1' } })

    await act(() => result.current.save())

    expect(JSON.parse(global.fetch.mock.calls[1][1].body).restoredFrom).toBe(1)
    expect(result.current.restoredFrom).toBeNull()
  })

  it('keeps a conflict until the latest version is reloaded', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(200, SAVED))
      .mockResolvedValueOnce(respond(409, { error: 'Someone else saved.' }))
      .mockResolvedValueOnce(respond(200, { ...SAVED, rev: 3 }))

    const { result } = renderHook(() => useJevDocument('tok', 'legal', stableLogout))
    await waitFor(() => expect(result.current.document).not.toBeNull())
    act(() => result.current.updateDraft({ set: { description: 'Mine' } }))
    await act(() => result.current.save())

    expect(result.current.conflict).toBe(true)
    expect(result.current.saveError).toBe('Someone else saved.')

    act(() => result.current.updateDraft({ set: { description: 'Mine again' } }))
    expect(result.current.saveError).toBe('Someone else saved.')

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.document.rev).toBe(3))

    expect(result.current.conflict).toBe(false)
    expect(result.current.saveError).toBeNull()
    expect(result.current.draft).toEqual(SAVED.data)
  })

  it('keeps the form and the conflict when reloading the latest version fails', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(200, SAVED))
      .mockResolvedValueOnce(respond(409, { error: 'Someone else saved.' }))
      .mockResolvedValueOnce(respond(500, { error: 'Failed to load the settings.' }))
      .mockResolvedValueOnce(respond(200, { ...SAVED, rev: 3 }))

    const { result } = renderHook(() => useJevDocument('tok', 'legal', stableLogout))
    await waitFor(() => expect(result.current.document).not.toBeNull())
    act(() => result.current.updateDraft({ set: { description: 'Mine' } }))
    await act(() => result.current.save())

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.saveError).toBe('Failed to load the settings.'))

    expect(result.current.loadError).toBeNull()
    expect(result.current.conflict).toBe(true)
    expect(result.current.document.rev).toBe(2)
    expect(result.current.draft).toEqual({ set: { description: 'Mine' } })

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.document.rev).toBe(3))

    expect(result.current.conflict).toBe(false)
    expect(result.current.saveError).toBeNull()
  })

  it('clears an ordinary save error on the next edit', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(200, SAVED))
      .mockResolvedValueOnce(respond(400, { error: 'Min confidence must be a number between 0 and 1.' }))

    const { result } = renderHook(() => useJevDocument('tok', 'legal', stableLogout))
    await waitFor(() => expect(result.current.document).not.toBeNull())
    await act(() => result.current.save())

    expect(result.current.saveError).toBe('Min confidence must be a number between 0 and 1.')
    expect(result.current.conflict).toBe(false)

    act(() => result.current.updateDraft({ set: { description: 'Fixed' } }))

    expect(result.current.saveError).toBeNull()
  })

  it('reports a load error', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond(500, { error: 'Failed to load the settings.' }))

    const { result } = renderHook(() => useJevDocument('tok', 'legal', stableLogout))

    await waitFor(() => expect(result.current.loadError).toBe('Failed to load the settings.'))
  })

  it('logs out when the session expires while loading or saving', async () => {
    const onLogout = vi.fn()
    global.fetch = vi.fn().mockResolvedValueOnce(respond(401, {}))

    renderHook(() => useJevDocument('tok', 'legal', onLogout))
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))

    global.fetch = vi.fn().mockResolvedValueOnce(respond(200, SAVED)).mockResolvedValueOnce(respond(401, {}))
    const { result } = renderHook(() => useJevDocument('tok', 'legal', onLogout))
    await waitFor(() => expect(result.current.document).not.toBeNull())
    await act(() => result.current.save())

    expect(onLogout).toHaveBeenCalledTimes(2)
    expect(result.current.saveError).toBeNull()
  })
})
