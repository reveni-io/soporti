import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ApiError } from '../../services/services.js'
import { useSaveField } from './useSaveField.js'

describe('useSaveField', () => {
  it('runs the work, reports success and stamps savedAt', async () => {
    const perform = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useSaveField(vi.fn()))

    let outcome
    await act(async () => {
      outcome = await result.current.save(perform)
    })

    expect(outcome).toBe(true)
    expect(perform).toHaveBeenCalledTimes(1)
    expect(result.current.savedAt).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
    expect(result.current.saving).toBe(false)
  })

  it('logs out on a 401 without setting an error or savedAt', async () => {
    const onLogout = vi.fn()

    const { result } = renderHook(() => useSaveField(onLogout))

    let outcome
    await act(async () => {
      outcome = await result.current.save(() => Promise.reject(new ApiError('Unauthorized', 401)))
    })

    expect(outcome).toBe(false)
    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    expect(result.current.savedAt).toBeNull()
  })

  it('exposes the error message of any other failure', async () => {
    const onLogout = vi.fn()

    const { result } = renderHook(() => useSaveField(onLogout))

    let outcome
    await act(async () => {
      outcome = await result.current.save(() => Promise.reject(new ApiError('Invalid value.', 400)))
    })

    expect(outcome).toBe(false)
    expect(result.current.error).toBe('Invalid value.')
    expect(result.current.savedAt).toBeNull()
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('clears a previous error when a later save succeeds', async () => {
    const { result } = renderHook(() => useSaveField(vi.fn()))

    await act(async () => {
      await result.current.save(() => Promise.reject(new ApiError('Nope.', 400)))
    })
    expect(result.current.error).toBe('Nope.')

    await act(async () => {
      await result.current.save(() => Promise.resolve())
    })

    expect(result.current.error).toBeNull()
  })

  it('clears the error on demand', async () => {
    const { result } = renderHook(() => useSaveField(vi.fn()))

    await act(async () => {
      await result.current.save(async () => {
        throw new Error('Too large')
      })
    })
    expect(result.current.error).toBe('Too large')

    act(() => result.current.clearError())

    expect(result.current.error).toBeNull()
  })
})
