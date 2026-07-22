import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()

vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const { getAllowedDomains, setAllowedDomains, ALLOWED_DOMAINS_KEY } = await import('./allowed-domains.js')

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
})

describe('getAllowedDomains', () => {
  it('returns the stored list', async () => {
    getConfigValue.mockResolvedValue(['example.com', 'other.com'])

    expect(await getAllowedDomains()).toEqual(['example.com', 'other.com'])
    expect(getConfigValue).toHaveBeenCalledWith(ALLOWED_DOMAINS_KEY)
  })

  it('returns an empty list when no row exists (fresh install — Google disabled)', async () => {
    getConfigValue.mockResolvedValue(null)

    expect(await getAllowedDomains()).toEqual([])
  })

  it('returns an empty list for a malformed stored value', async () => {
    getConfigValue.mockResolvedValue('not-an-array')

    expect(await getAllowedDomains()).toEqual([])
  })
})

describe('setAllowedDomains', () => {
  it('persists the list under the config key', async () => {
    const result = await setAllowedDomains(['a.io', 'b.io'])

    expect(setConfigValue).toHaveBeenCalledWith(ALLOWED_DOMAINS_KEY, ['a.io', 'b.io'])
    expect(result).toEqual(['a.io', 'b.io'])
  })
})
