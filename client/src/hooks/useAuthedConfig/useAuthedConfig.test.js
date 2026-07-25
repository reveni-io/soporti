import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { ApiError } from '../../services/services.js'
import { useAuthedConfig } from './useAuthedConfig.js'

describe('useAuthedConfig', () => {
  it('loads the config with the token', async () => {
    const fetchConfig = vi.fn().mockResolvedValue({ tokenConfigured: true, org: 'my-org' })

    const { result } = renderHook(() => useAuthedConfig(fetchConfig, 'tok', vi.fn()))

    await waitFor(() => expect(result.current.config).toEqual({ tokenConfigured: true, org: 'my-org' }))
    expect(result.current.error).toBeNull()
    expect(fetchConfig).toHaveBeenCalledWith('tok')
  })

  it('logs out on a 401 and leaves the config unset', async () => {
    const fetchConfig = vi.fn().mockRejectedValue(new ApiError('Unauthorized', 401))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAuthedConfig(fetchConfig, 'tok', onLogout))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
    expect(result.current.config).toBeNull()
  })

  it('exposes the message of any other failure', async () => {
    const fetchConfig = vi.fn().mockRejectedValue(new ApiError('Server exploded', 500))
    const onLogout = vi.fn()

    const { result } = renderHook(() => useAuthedConfig(fetchConfig, 'tok', onLogout))

    await waitFor(() => expect(result.current.error).toBe('Server exploded'))
    expect(result.current.config).toBeNull()
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('merges a patch into the loaded config', async () => {
    const fetchConfig = vi.fn().mockResolvedValue({ tokenConfigured: false, org: 'my-org' })

    const { result } = renderHook(() => useAuthedConfig(fetchConfig, 'tok', vi.fn()))
    await waitFor(() => expect(result.current.config).not.toBeNull())

    act(() => {
      result.current.patchConfig({ tokenConfigured: true })
    })

    expect(result.current.config).toEqual({ tokenConfigured: true, org: 'my-org' })
  })

  it('ignores a resolution that lands after unmount', async () => {
    let resolveConfig
    const fetchConfig = vi.fn().mockReturnValue(new Promise(resolve => (resolveConfig = resolve)))

    const { result, unmount } = renderHook(() => useAuthedConfig(fetchConfig, 'tok', vi.fn()))
    unmount()

    await act(async () => {
      resolveConfig({ org: 'late' })
    })

    expect(result.current.config).toBeNull()
  })

  it('reloads when the token changes', async () => {
    const fetchConfig = vi.fn().mockResolvedValueOnce({ org: 'first' }).mockResolvedValueOnce({ org: 'second' })
    const onLogout = vi.fn()

    const { result, rerender } = renderHook(({ token }) => useAuthedConfig(fetchConfig, token, onLogout), {
      initialProps: { token: 'tok-1' },
    })
    await waitFor(() => expect(result.current.config).toEqual({ org: 'first' }))

    rerender({ token: 'tok-2' })

    await waitFor(() => expect(result.current.config).toEqual({ org: 'second' }))
    expect(fetchConfig).toHaveBeenNthCalledWith(2, 'tok-2')
  })
})
