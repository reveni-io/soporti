import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBotForm } from './useBotForm.js'

const TRIAGER = {
  id: 3,
  name: 'Ticket triager',
  description: 'Tickets',
  profile: 'tech',
  avatarSeed: 'seed-3',
  avatarStyle: { shape: 'cloud', hue: 195, tone: 'deep', mood: 'smug' },
}
const SHAPE_IDS = ['round', 'organic', 'boxy', 'capsule', 'nub', 'cloud', 'droplet', 'hexagon', 'sun', 'triangle']
const HUES = [25, 55, 90, 135, 160, 195, 235, 270, 305, 345]
const SHUFFLE_TONE_IDS = ['pastel', 'mid', 'deep', 'bright']

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useBotForm', () => {
  it('starts a new bot empty, with the support profile and a random avatar', () => {
    const { result } = renderHook(() => useBotForm({ bot: null, token: 'tok' }))

    expect(result.current.isEditing).toBe(false)
    expect(result.current.name).toBe('')
    expect(result.current.profile).toBe('support')
    expect(result.current.avatarSeed).toMatch(/^[0-9a-f]{32}$/)
    expect(result.current.canSave).toBe(false)
  })

  it('starts a new bot with a random shape, color and colorful tone and a neutral mood', () => {
    const { result } = renderHook(() => useBotForm({ bot: null, token: 'tok' }))

    const { shape, hue, tone, mood } = result.current.avatarStyle
    expect(SHAPE_IDS).toContain(shape)
    expect(HUES).toContain(hue)
    expect(SHUFFLE_TONE_IDS).toContain(tone)
    expect(mood).toBe('neutral')
  })

  it('leaves every trait unpinned for a bot created before avatars could be styled', () => {
    const { result } = renderHook(() => useBotForm({ bot: { ...TRIAGER, avatarStyle: null }, token: 'tok' }))

    expect(result.current.avatarStyle).toEqual({})
  })

  it('starts from the bot it edits', () => {
    const { result } = renderHook(() => useBotForm({ bot: TRIAGER, token: 'tok' }))

    expect(result.current.isEditing).toBe(true)
    expect(result.current.name).toBe('Ticket triager')
    expect(result.current.profile).toBe('tech')
    expect(result.current.avatarSeed).toBe('seed-3')
    expect(result.current.avatarStyle).toEqual(TRIAGER.avatarStyle)
    expect(result.current.canSave).toBe(true)
  })

  it('picks a different face on shuffle and keeps the mood', () => {
    const { result } = renderHook(() => useBotForm({ bot: TRIAGER, token: 'tok' }))

    act(() => result.current.shuffleAvatar())

    expect(result.current.avatarSeed).not.toBe('seed-3')
    expect(SHAPE_IDS).toContain(result.current.avatarStyle.shape)
    expect(HUES).toContain(result.current.avatarStyle.hue)
    expect(SHUFFLE_TONE_IDS).toContain(result.current.avatarStyle.tone)
    expect(result.current.avatarStyle.mood).toBe('smug')
  })

  it('gives a neutral mood to a shuffled bot that had none', () => {
    const { result } = renderHook(() => useBotForm({ bot: { ...TRIAGER, avatarStyle: null }, token: 'tok' }))

    act(() => result.current.shuffleAvatar())

    expect(result.current.avatarStyle.mood).toBe('neutral')
  })

  it('pins one trait at a time and keeps the others', () => {
    const { result } = renderHook(() => useBotForm({ bot: TRIAGER, token: 'tok' }))

    act(() => result.current.pickAvatarTrait('shape', 'sun'))
    act(() => result.current.pickAvatarTrait('hue', 345))

    expect(result.current.avatarStyle).toEqual({ shape: 'sun', hue: 345, tone: 'deep', mood: 'smug' })
    expect(result.current.avatarSeed).toBe('seed-3')
  })

  it('does not submit an incomplete bot', async () => {
    global.fetch = vi.fn()
    const onCreated = vi.fn()
    const { result } = renderHook(() => useBotForm({ bot: null, token: 'tok', onCreated }))

    act(() => result.current.setName('Triager'))
    await act(async () => {
      await result.current.submit()
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('hands the updated bot back after saving', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ bot: { ...TRIAGER, profile: 'support' } }))
    const onUpdated = vi.fn()
    const onCreated = vi.fn()
    const { result } = renderHook(() => useBotForm({ bot: TRIAGER, token: 'tok', onUpdated, onCreated }))

    act(() => result.current.setProfile('support'))
    await act(async () => {
      await result.current.submit()
    })

    expect(onUpdated).toHaveBeenCalledTimes(1)
    expect(onUpdated).toHaveBeenCalledWith({ ...TRIAGER, profile: 'support' })
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('exposes the save error', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ error: 'Invalid name.' }, 400))
    const { result } = renderHook(() => useBotForm({ bot: TRIAGER, token: 'tok', onUpdated: vi.fn() }))

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.saveError).toBe('Invalid name.')
    expect(result.current.isSaving).toBe(false)
  })

  it('hands the deleted bot back', async () => {
    global.fetch = vi.fn().mockResolvedValue(respond({ ok: true }))
    const onDeleted = vi.fn()
    const { result } = renderHook(() => useBotForm({ bot: TRIAGER, token: 'tok', onDeleted }))

    await act(async () => {
      await result.current.remove()
    })

    expect(onDeleted).toHaveBeenCalledTimes(1)
    expect(onDeleted).toHaveBeenCalledWith(TRIAGER)
    expect(result.current.deleteError).toBeNull()
  })
})
