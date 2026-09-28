import { describe, it, expect, vi, beforeEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const {
  getShopifyTokenUrl,
  setShopifyTokenUrl,
  getShopifyTokenAuthorization,
  setShopifyTokenAuthorization,
  isShopifyConfigured,
  SHOPIFY_TOKEN_URL_KEY,
  SHOPIFY_TOKEN_AUTHORIZATION_KEY,
  _resetShopifySettingsCacheForTests,
} = await import('./settings.js')

const TOKEN_URL = 'https://tokens.example.com/shopify/{{store}}'

beforeEach(() => {
  getConfigValue.mockReset()
  setConfigValue.mockReset()
  _resetShopifySettingsCacheForTests()
})

describe('getShopifyTokenUrl', () => {
  it('returns the stored URL template', async () => {
    getConfigValue.mockResolvedValue(TOKEN_URL)

    expect(await getShopifyTokenUrl()).toBe(TOKEN_URL)
    expect(getConfigValue).toHaveBeenCalledWith(SHOPIFY_TOKEN_URL_KEY)
  })

  it('returns null when unset or empty', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getShopifyTokenUrl()).toBeNull()

    _resetShopifySettingsCacheForTests()
    getConfigValue.mockResolvedValue('')
    expect(await getShopifyTokenUrl()).toBeNull()
  })

  it('caches the value between calls', async () => {
    getConfigValue.mockResolvedValue(TOKEN_URL)

    await getShopifyTokenUrl()
    await getShopifyTokenUrl()

    expect(getConfigValue).toHaveBeenCalledTimes(1)
  })
})

describe('setShopifyTokenUrl', () => {
  it('stores the URL and invalidates the cache', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await getShopifyTokenUrl()).toBeNull()

    await setShopifyTokenUrl(TOKEN_URL)

    expect(setConfigValue).toHaveBeenCalledWith(SHOPIFY_TOKEN_URL_KEY, TOKEN_URL)
    getConfigValue.mockResolvedValue(TOKEN_URL)
    expect(await getShopifyTokenUrl()).toBe(TOKEN_URL)
  })
})

describe('shopify token authorization', () => {
  it('stores and reads the Authorization header value under its own key', async () => {
    await setShopifyTokenAuthorization('Bearer secret')
    expect(setConfigValue).toHaveBeenCalledWith(SHOPIFY_TOKEN_AUTHORIZATION_KEY, 'Bearer secret')

    getConfigValue.mockResolvedValue('Bearer secret')
    expect(await getShopifyTokenAuthorization()).toBe('Bearer secret')
    expect(getConfigValue).toHaveBeenCalledWith(SHOPIFY_TOKEN_AUTHORIZATION_KEY)
  })
})

describe('isShopifyConfigured', () => {
  it('is true once the token service URL is set', async () => {
    getConfigValue.mockResolvedValue(TOKEN_URL)
    expect(await isShopifyConfigured()).toBe(true)
  })

  it('is false without a token service URL', async () => {
    getConfigValue.mockResolvedValue(null)
    expect(await isShopifyConfigured()).toBe(false)
  })
})
