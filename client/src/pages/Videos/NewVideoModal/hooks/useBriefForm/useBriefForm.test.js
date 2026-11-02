import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBriefForm } from './useBriefForm.js'

const VIDEO = { id: '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601' }

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useBriefForm', () => {
  it('starts from the defaults without errors', () => {
    const { result } = renderHook(() => useBriefForm({ token: 'tok', onLogout: vi.fn(), onCreated: vi.fn() }))

    expect(result.current.fields).toEqual({
      idea: '',
      repos: [],
      path: '',
      audience: 'merchants',
      language: 'en',
      format: '16:9',
      durationSeconds: 30,
      pace: 'relaxed',
    })
    expect(result.current.errors).toEqual({})
  })

  it('validates only after the first submit', async () => {
    global.fetch = vi.fn()
    const { result } = renderHook(() => useBriefForm({ token: 'tok', onLogout: vi.fn(), onCreated: vi.fn() }))

    await act(() => result.current.submit([]))

    expect(result.current.errors).toEqual({
      idea: 'Describe what the video should tell.',
      repos: 'Pick at least one repo.',
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('toggles repos in and out of the selection', () => {
    const { result } = renderHook(() => useBriefForm({ token: 'tok', onLogout: vi.fn(), onCreated: vi.fn() }))

    act(() => result.current.toggleRepo('reveni/app'))
    act(() => result.current.toggleRepo('reveni/api'))
    act(() => result.current.toggleRepo('reveni/app'))

    expect(result.current.fields.repos).toEqual(['reveni/api'])
  })

  it('posts the brief with the attachments in the contract shape', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ video: VIDEO }, 201))
    const onCreated = vi.fn()
    const { result } = renderHook(() => useBriefForm({ token: 'tok', onLogout: vi.fn(), onCreated }))

    act(() => result.current.setField('idea', 'Refunds'))
    act(() => result.current.toggleRepo('reveni/app'))
    act(() => result.current.setField('path', '   '))
    await act(() =>
      result.current.submit([
        { name: 'spec.pdf', text: 'Rules', truncated: true },
        { name: 'logo.png', imageId: 'img-1' },
      ])
    )

    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledWith(VIDEO)
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).brief).toMatchObject({
      path: null,
      attachments: [
        { name: 'spec.pdf', text: 'Rules' },
        { name: 'logo.png', imageId: 'img-1' },
      ],
    })
  })

  it('exposes the server error', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ error: 'Invalid brief.' }, 400))
    const onCreated = vi.fn()
    const { result } = renderHook(() => useBriefForm({ token: 'tok', onLogout: vi.fn(), onCreated }))

    act(() => result.current.setField('idea', 'Refunds'))
    act(() => result.current.toggleRepo('reveni/app'))
    await act(() => result.current.submit([]))

    expect(result.current.error).toBe('Invalid brief.')
    expect(result.current.submitting).toBe(false)
    expect(onCreated).not.toHaveBeenCalled()
  })
})
