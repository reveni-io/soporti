import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const { getShopifyTokenQuery, setShopifyTokenQuery, SHOPIFY_TOKEN_QUERY_KEY, _resetShopifySettingsCacheForTests } =
  await import('./settings.js')

const QUERY = 'SELECT domain, token FROM stores WHERE domain = {{store}} LIMIT 1'

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetShopifySettingsCacheForTests()
})

describe('getShopifyTokenQuery', () => {
  it('returns the stored query template', async () => {
    getConfigValue.mockResolvedValue(QUERY)

    expect(await getShopifyTokenQuery()).toBe(QUERY)
    expect(getConfigValue).toHaveBeenCalledWith(SHOPIFY_TOKEN_QUERY_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getShopifyTokenQuery()).toBeNull()

    _resetShopifySettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getShopifyTokenQuery()).toBeNull()
  })

  it('caches the value between calls', async () => {
    getConfigValue.mockResolvedValue(QUERY)

    await getShopifyTokenQuery()
    await getShopifyTokenQuery()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setShopifyTokenQuery', () => {
  it('stores the query template', async () => {
    await setShopifyTokenQuery(QUERY)
    expect(setConfigValue).toHaveBeenCalledWith(SHOPIFY_TOKEN_QUERY_KEY, QUERY)
  })

  it('clears the query on an empty string', async () => {
    await setShopifyTokenQuery('')
    expect(setConfigValue).toHaveBeenCalledWith(SHOPIFY_TOKEN_QUERY_KEY, '')
  })

  it('invalidates the cache so the next read reflects the save', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getShopifyTokenQuery()).toBeNull()

    await setShopifyTokenQuery(QUERY)

    getConfigValue.mockResolvedValue(QUERY)
    expect(await getShopifyTokenQuery()).toBe(QUERY)
  })
})
