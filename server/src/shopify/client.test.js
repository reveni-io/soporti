import { describe, it, expect, vi, beforeEach } from 'vitest'

const TOKEN_URL = 'https://tokens.example.com/shopify/{{store}}'
const mockGetShopifyTokenUrl = vi.fn(async () => TOKEN_URL)
const mockGetShopifyTokenAuthorization = vi.fn(async () => 'internal-secret')
const mockIsShopifyConfigured = vi.fn(async () => true)

vi.mock('./settings.js', () => ({
  getShopifyTokenUrl: (...args) => mockGetShopifyTokenUrl(...args),
  getShopifyTokenAuthorization: (...args) => mockGetShopifyTokenAuthorization(...args),
  isShopifyConfigured: (...args) => mockIsShopifyConfigured(...args),
  STORE_PLACEHOLDER: '{{store}}',
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { isConfigured, getOrder, searchOrders, getProduct, getWebhooks, graphqlQuery } = await import('./client.js')

function mockResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

function tokenPayload(overrides = {}) {
  return {
    access_token: 'shpat_test123',
    shop_domain: 'teststore.myshopify.com',
    api_version: '2026-07',
    expires_at: null,
    ...overrides,
  }
}

function mockStoreToken(overrides) {
  mockFetch.mockResolvedValueOnce(mockResponse(tokenPayload(overrides)))
}

describe('isConfigured', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when the token service is configured', async () => {
    expect(await isConfigured()).toBe(true)
  })

  it('returns false when the token service is not configured', async () => {
    mockIsShopifyConfigured.mockResolvedValueOnce(false)
    expect(await isConfigured()).toBe(false)
  })
})

describe('store credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('throws when no store identifier is provided', async () => {
    await expect(getOrder('123', '')).rejects.toThrow('store identifier')
    await expect(getOrder('123', undefined)).rejects.toThrow('store identifier')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws when the token service is not configured', async () => {
    mockGetShopifyTokenUrl.mockResolvedValueOnce(null)
    await expect(getOrder('123', 'unconfigured-store')).rejects.toThrow('not configured')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('requests the token with the encoded store identifier and the configured authorization', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({ order: { id: 1, order_number: 1 } }))

    await getOrder('1', 'store a/b')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [tokenUrl, tokenOptions] = mockFetch.mock.calls[0]
    expect(tokenUrl).toBe('https://tokens.example.com/shopify/store%20a%2Fb')
    expect(tokenOptions.headers).toEqual({ Authorization: 'internal-secret' })
  })

  it('omits the Authorization header when none is configured', async () => {
    mockGetShopifyTokenAuthorization.mockResolvedValueOnce(null)
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({ order: { id: 1, order_number: 1 } }))

    await getOrder('1', 'no-auth-store')

    expect(mockFetch.mock.calls[0][1].headers).toEqual({})
  })

  it('calls Shopify with the returned token, domain and API version', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({ order: { id: 1, order_number: 1 } }))

    await getOrder('1', 'versioned-store')

    const [shopifyUrl, shopifyOptions] = mockFetch.mock.calls[1]
    expect(shopifyUrl).toBe('https://teststore.myshopify.com/admin/api/2026-07/orders/1.json')
    expect(shopifyOptions.headers['X-Shopify-Access-Token']).toBe('shpat_test123')
  })

  it('falls back to the default API version when the service does not return one', async () => {
    mockStoreToken({ api_version: undefined })
    mockFetch.mockResolvedValueOnce(mockResponse({ order: { id: 1, order_number: 1 } }))

    await getOrder('1', 'unversioned-store')

    expect(mockFetch.mock.calls[1][0]).toBe('https://teststore.myshopify.com/admin/api/2024-10/orders/1.json')
  })

  it('tells the agent to resolve the store ID when the service does not know the store', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, false, 404))
    await expect(getOrder('1', 'Acme')).rejects.toThrow('does not know store "Acme"')
  })

  it('reports a store that must be reconnected as terminal', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ code: 'reauth_required' }, false, 409))
    await expect(getOrder('1', 'revoked-store')).rejects.toThrow('must be reconnected to Shopify')
  })

  it('points the admin at /admin when the service rejects the authorization', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, false, 401))
    await expect(getOrder('1', 'bad-secret-store')).rejects.toThrow('/admin → Shopify')

    mockFetch.mockResolvedValueOnce(mockResponse({}, false, 403))
    await expect(getOrder('1', 'forbidden-store')).rejects.toThrow('/admin → Shopify')
  })

  it('reports other token service failures as transient', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ code: 'refresh_failed' }, false, 503))
    await expect(getOrder('1', 'flaky-store')).rejects.toThrow('failed (503)')
  })

  it('throws when the service response lacks the token or the domain', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ access_token: 'shpat_x' }))
    await expect(getOrder('1', 'incomplete-store')).rejects.toThrow('"access_token" and "shop_domain"')
  })

  it('reuses a non-expiring token for a minute', async () => {
    vi.useFakeTimers()
    mockStoreToken()
    mockFetch.mockResolvedValue(mockResponse({ order: { id: 1, order_number: 1001 } }))

    await getOrder('1', 'cached-store')
    await getOrder('2', 'cached-store')
    expect(mockFetch).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(61_000)
    mockStoreToken()
    await getOrder('3', 'cached-store')
    expect(mockFetch).toHaveBeenCalledTimes(5)
    expect(mockFetch.mock.calls[3][0]).toBe('https://tokens.example.com/shopify/cached-store')
  })

  it('reuses an expiring token until shortly before it expires', async () => {
    vi.useFakeTimers()
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString()
    mockStoreToken({ expires_at: expiresAt })
    mockFetch.mockResolvedValue(mockResponse({ order: { id: 1, order_number: 1001 } }))

    await getOrder('1', 'expiring-store')
    vi.advanceTimersByTime(58 * 60_000)
    await getOrder('2', 'expiring-store')
    expect(mockFetch).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(2 * 60_000)
    mockStoreToken()
    await getOrder('3', 'expiring-store')
    expect(mockFetch).toHaveBeenCalledTimes(5)
    expect(mockFetch.mock.calls[3][0]).toBe('https://tokens.example.com/shopify/expiring-store')
  })

  it('fetches a fresh token and retries once when Shopify rejects the cached one', async () => {
    mockStoreToken({ access_token: 'shpat_stale' })
    mockFetch.mockResolvedValueOnce(mockResponse({}, false, 401))
    mockStoreToken({ access_token: 'shpat_fresh' })
    mockFetch.mockResolvedValueOnce(mockResponse({ order: { id: 7, order_number: 1007 } }))

    const order = await getOrder('7', 'rotated-store')

    expect(order.orderNumber).toBe(1007)
    expect(mockFetch).toHaveBeenCalledTimes(4)
    expect(mockFetch.mock.calls[1][1].headers['X-Shopify-Access-Token']).toBe('shpat_stale')
    expect(mockFetch.mock.calls[3][1].headers['X-Shopify-Access-Token']).toBe('shpat_fresh')
  })

  it('gives up when Shopify also rejects the fresh token', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({}, false, 401))
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({}, false, 401))

    await expect(getOrder('1', 'dead-store')).rejects.toThrow('access token was rejected')
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })
})

describe('getOrder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns formatted order', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        order: {
          id: 12345,
          order_number: 1001,
          name: '#1001',
          email: 'test@example.com',
          phone: null,
          financial_status: 'paid',
          fulfillment_status: 'fulfilled',
          total_price: '99.99',
          currency: 'EUR',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          cancelled_at: null,
          cancel_reason: null,
          customer: { id: 1, email: 'test@example.com', first_name: 'John', last_name: 'Doe' },
          line_items: [{ id: 1, title: 'Product', variant_title: 'M', sku: 'SKU1', quantity: 1, price: '99.99' }],
          shipping_address: { city: 'Madrid', province: 'Madrid', country: 'Spain' },
          fulfillments: [
            {
              id: 1,
              status: 'success',
              tracking_number: 'TRK1',
              tracking_url: 'https://track.me',
              created_at: '2024-01-02',
            },
          ],
          refunds: [],
          tags: 'vip',
          note: null,
        },
      })
    )

    const order = await getOrder('12345', 'order-store')
    expect(order.id).toBe(12345)
    expect(order.orderNumber).toBe(1001)
    expect(order.financialStatus).toBe('paid')
    expect(order.customer.firstName).toBe('John')
    expect(order.lineItems).toHaveLength(1)
    expect(order.fulfillments[0].trackingNumber).toBe('TRK1')
    expect(order.storeDomain).toBe('teststore.myshopify.com')
    expect(JSON.stringify(order)).not.toContain('shpat_')
  })

  it('handles order without customer or shipping address', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        order: {
          id: 1,
          order_number: 1,
          name: '#1',
          email: null,
          phone: null,
          financial_status: 'pending',
          fulfillment_status: null,
          total_price: '0',
          currency: 'EUR',
          created_at: '',
          updated_at: '',
          cancelled_at: null,
          cancel_reason: null,
          customer: null,
          line_items: [],
          shipping_address: null,
          fulfillments: [],
          refunds: [],
          tags: '',
          note: null,
        },
      })
    )

    const order = await getOrder('1', 'bare-order-store')
    expect(order.customer).toBeNull()
    expect(order.shippingAddress).toBeNull()
  })

  it('throws on Shopify API error', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({}, false, 404))
    await expect(getOrder('999', 'error-store')).rejects.toThrow('Shopify API GET')
  })
})

describe('searchOrders', () => {
  beforeEach(() => vi.clearAllMocks())

  it('searches by email when query contains @', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        orders: [
          {
            id: 1,
            order_number: 1,
            name: '#1',
            email: 'a@b.com',
            financial_status: 'paid',
            fulfillment_status: null,
            total_price: '10',
            currency: 'EUR',
            created_at: '',
          },
        ],
      })
    )

    const results = await searchOrders('a@b.com', 'search-store')
    expect(results).toHaveLength(1)
    const url = mockFetch.mock.calls[1][0]
    expect(url).toContain('email=')
  })

  it('searches by name for non-email queries', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({ orders: [] }))

    await searchOrders('1001', 'search-store-2')
    const url = mockFetch.mock.calls[1][0]
    expect(url).toContain('name=')
  })
})

describe('getProduct', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns formatted product with variants', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        product: {
          id: 456,
          title: 'T-Shirt',
          handle: 't-shirt',
          status: 'active',
          product_type: 'Apparel',
          vendor: 'Test',
          tags: 'summer',
          created_at: '',
          updated_at: '',
          variants: [
            {
              id: 1,
              title: 'M',
              sku: 'TS-M',
              price: '29.99',
              compare_at_price: '39.99',
              inventory_quantity: 10,
              weight: 200,
              weight_unit: 'g',
            },
          ],
        },
      })
    )

    const product = await getProduct('456', 'product-store')
    expect(product.title).toBe('T-Shirt')
    expect(product.variants).toHaveLength(1)
    expect(product.variants[0].sku).toBe('TS-M')
  })
})

describe('getWebhooks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns formatted webhooks list', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        webhooks: [
          {
            id: 1,
            topic: 'orders/create',
            address: 'https://example.com/hook',
            format: 'json',
            created_at: '',
            updated_at: '',
          },
          {
            id: 2,
            topic: 'products/update',
            address: 'https://example.com/hook2',
            format: 'json',
            created_at: '',
            updated_at: '',
          },
        ],
      })
    )

    const webhooks = await getWebhooks('webhooks-store')
    expect(webhooks).toHaveLength(2)
    expect(webhooks[0].topic).toBe('orders/create')
  })
})

describe('graphqlQuery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('executes read-only query and returns data', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({ data: { shop: { name: 'Test Store' } } }))

    const result = await graphqlQuery('{ shop { name } }', {}, 'graphql-store')
    expect(result.data.shop.name).toBe('Test Store')
    expect(result.storeDomain).toBe('teststore.myshopify.com')
  })

  it('blocks mutations', async () => {
    await expect(graphqlQuery('mutation { orderUpdate { id } }', {}, 'graphql-store-2')).rejects.toThrow(
      'Mutations are not permitted'
    )
  })

  it('blocks mutations with leading whitespace', async () => {
    await expect(graphqlQuery('  mutation CreateOrder { ... }', {}, 'graphql-store-3')).rejects.toThrow(
      'Mutations are not permitted'
    )
  })

  it('blocks mutation keyword in complex queries', async () => {
    await expect(graphqlQuery('# comment\nmutation { delete { id } }', {}, 'graphql-store-4')).rejects.toThrow(
      'Mutations are not permitted'
    )
  })

  it('throws on GraphQL errors', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({ errors: [{ message: 'Field not found' }] }))

    await expect(graphqlQuery('{ invalid }', {}, 'graphql-store-5')).rejects.toThrow('GraphQL errors')
  })
})
