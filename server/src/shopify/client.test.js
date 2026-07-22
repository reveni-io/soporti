import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRunQuery = vi.fn()
const mockIsPostgresConfigured = vi.fn(async () => true)

vi.mock('../postgres/client.js', () => ({
  isConfigured: (...args) => mockIsPostgresConfigured(...args),
  runQuery: (...args) => mockRunQuery(...args),
}))

const TOKEN_QUERY =
  "SELECT domain, token FROM stores WHERE domain ILIKE '%' || {{store}} || '%' OR id::text = {{store}} LIMIT 1"
const mockGetShopifyTokenQuery = vi.fn(async () => TOKEN_QUERY)

vi.mock('./settings.js', () => ({
  getShopifyTokenQuery: (...args) => mockGetShopifyTokenQuery(...args),
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

const storeTokenRow = {
  domain: 'teststore.myshopify.com',
  token: 'shpat_test123',
}

function mockStoreToken() {
  mockRunQuery.mockResolvedValueOnce({
    rows: [storeTokenRow],
    columns: ['domain', 'token'],
    rowCount: 1,
    truncated: false,
  })
}

describe('isConfigured', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when postgres and the token query are configured', async () => {
    expect(await isConfigured()).toBe(true)
  })

  it('returns false when the token query is not configured', async () => {
    mockGetShopifyTokenQuery.mockResolvedValueOnce(null)
    expect(await isConfigured()).toBe(false)
  })

  it('returns false when postgres is not configured', async () => {
    mockIsPostgresConfigured.mockResolvedValueOnce(false)
    expect(await isConfigured()).toBe(false)
  })
})

describe('resolveStoreCredentials', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws when no store identifier is provided', async () => {
    await expect(getOrder('123', '')).rejects.toThrow('store identifier')
    await expect(getOrder('123', undefined)).rejects.toThrow('store identifier')
  })

  it('throws when the token query is not configured', async () => {
    mockGetShopifyTokenQuery.mockResolvedValueOnce(null)
    await expect(getOrder('123', 'somestore')).rejects.toThrow('not configured')
  })

  it('throws when no credentials are found for the store', async () => {
    mockRunQuery.mockResolvedValueOnce({ rows: [], columns: [], rowCount: 0, truncated: false })
    await expect(getOrder('123', 'unknown')).rejects.toThrow('No Shopify credentials found')
  })

  it('throws when the query result is missing domain or token columns', async () => {
    mockRunQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'store' }],
      columns: ['id', 'name'],
      rowCount: 1,
      truncated: false,
    })
    await expect(getOrder('123', 'badquery')).rejects.toThrow('"domain" and "token" columns')
  })

  it('replaces every placeholder with the quoted store identifier', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({ order: { id: 1, order_number: 1 } }))

    await getOrder('1', 'mystore')

    const sql = mockRunQuery.mock.calls[0][0]
    expect(sql).not.toContain('{{store}}')
    expect(sql).toContain("'mystore'")
  })

  it('escapes quotes so the identifier cannot break out of the literal', async () => {
    mockRunQuery.mockResolvedValueOnce({ rows: [], columns: [], rowCount: 0, truncated: false })
    await expect(getOrder('123', "test'; DROP TABLE users--")).rejects.toThrow('No Shopify credentials found')
    const sql = mockRunQuery.mock.calls[0][0]
    expect(sql).toContain("'test''; DROP TABLE users--'")
  })

  it('caches credentials for subsequent calls', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValue(mockResponse({ order: { id: 1, order_number: 1001 } }))

    await getOrder('1', 'cached-store')
    await getOrder('2', 'cached-store')

    expect(mockRunQuery).toHaveBeenCalledTimes(1)
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
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('email=')
  })

  it('searches by name for non-email queries', async () => {
    mockStoreToken()
    mockFetch.mockResolvedValueOnce(mockResponse({ orders: [] }))

    await searchOrders('1001', 'search-store-2')
    const url = mockFetch.mock.calls[0][0]
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
