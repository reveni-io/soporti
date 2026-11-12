import { describe, it, expect, vi } from 'vitest'
import { ApiError } from '../../../services/services.js'
import { sendGuarded } from './guarded-request.js'

describe('sendGuarded', () => {
  it('resolves with what the request returned', async () => {
    const onLogout = vi.fn()

    await expect(sendGuarded(async () => ({ ok: true }), onLogout)).resolves.toEqual({ ok: true })
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('logs out and resolves with nothing when the session expired', async () => {
    const onLogout = vi.fn()
    const expired = async () => {
      throw new ApiError('Unauthorized', 401)
    }

    await expect(sendGuarded(expired, onLogout)).resolves.toBeNull()
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('rejects with any other failure', async () => {
    const onLogout = vi.fn()
    const failing = async () => {
      throw new ApiError('You already have 20 dashboards.', 422)
    }

    await expect(sendGuarded(failing, onLogout)).rejects.toThrow('You already have 20 dashboards.')
    expect(onLogout).not.toHaveBeenCalled()
  })
})
