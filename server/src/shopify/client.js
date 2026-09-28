import { getShopifyTokenAuthorization, getShopifyTokenUrl, isShopifyConfigured, STORE_PLACEHOLDER } from './settings.js'

const LOG_PREFIX = '[shopify]'
const REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_API_VERSION = '2024-10'
const DEFAULT_TOKEN_CACHE_TTL_MS = 60_000
const TOKEN_EXPIRY_MARGIN_MS = 60_000
const UNAUTHORIZED_STATUS = 401

const TOKEN_SERVICE_REJECTED_STATUSES = [401, 403]
const STORE_NOT_FOUND_STATUS = 404
const REAUTH_REQUIRED_STATUS = 409

const tokenCache = new Map()

export async function isConfigured() {
  return isShopifyConfigured()
}

function parseStoreIdentifier(store) {
  const identifier = String(store ?? '').trim()
  if (!identifier) {
    throw new Error('A store identifier must be provided')
  }

  return identifier
}

function describeTokenServiceError(status, identifier) {
  if (TOKEN_SERVICE_REJECTED_STATUSES.includes(status)) {
    return 'The Shopify token service rejected the configured Authorization header. An admin must check it in /admin → Shopify.'
  }
  if (status === STORE_NOT_FOUND_STATUS) {
    return `The Shopify token service does not know store "${identifier}". Pass the store identifier it expects (resolve the store's ID in the database first), not its commercial name or domain.`
  }
  if (status === REAUTH_REQUIRED_STATUS) {
    return `Store "${identifier}" must be reconnected to Shopify by the merchant: its Shopify authorization is no longer valid, so its data cannot be read until then. Do not retry.`
  }

  return `The Shopify token service failed (${status}) for store "${identifier}". Try again in a moment.`
}

function cacheLifetimeMs(expiresAt) {
  if (!expiresAt) return DEFAULT_TOKEN_CACHE_TTL_MS

  return Math.max(0, Date.parse(expiresAt) - Date.now() - TOKEN_EXPIRY_MARGIN_MS)
}

async function fetchStoreCredentials(identifier) {
  const [template, authorization] = await Promise.all([getShopifyTokenUrl(), getShopifyTokenAuthorization()])

  if (!template) {
    throw new Error('The Shopify token service is not configured. An admin must set it in /admin → Shopify.')
  }

  console.log(`${LOG_PREFIX} getStoreToken(${identifier})`)
  const url = template.replaceAll(STORE_PLACEHOLDER, encodeURIComponent(identifier))
  const headers = authorization ? { Authorization: authorization } : {}
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })

  if (!res.ok) {
    throw new Error(describeTokenServiceError(res.status, identifier))
  }

  const body = await res.json()

  if (!body?.access_token || !body?.shop_domain) {
    throw new Error('The Shopify token service must return "access_token" and "shop_domain".')
  }

  return {
    token: body.access_token,
    domain: body.shop_domain,
    apiVersion: body.api_version || DEFAULT_API_VERSION,
    expiresAt: body.expires_at ?? null,
  }
}

async function resolveStoreCredentials(identifier) {
  const cached = tokenCache.get(identifier)

  if (cached && cached.validUntil > Date.now()) {
    console.log(`${LOG_PREFIX} getStoreToken(${identifier}) (cached)`)
    return cached.value
  }

  const value = await fetchStoreCredentials(identifier)
  tokenCache.set(identifier, { value, validUntil: Date.now() + cacheLifetimeMs(value.expiresAt) })

  return value
}

function buildShopifyUrl({ domain, apiVersion }, path) {
  const cleanDomain = domain.includes('.myshopify.com') ? domain : `${domain}.myshopify.com`
  return `https://${cleanDomain}/admin/api/${apiVersion}${path}`
}

async function shopifyFetch(credentials, method, path, body) {
  const url = buildShopifyUrl(credentials, path)
  console.log(`${LOG_PREFIX} ${method} ${url}`)

  const opts = {
    method,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      'X-Shopify-Access-Token': credentials.token,
      'Content-Type': 'application/json',
    },
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(url, opts)

  if (res.status === UNAUTHORIZED_STATUS) return { unauthorized: true }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify API ${method} ${path} failed (${res.status}): ${text}`)
  }

  return { data: await res.json() }
}

async function storeRequest(store, method, path, body) {
  const identifier = parseStoreIdentifier(store)

  const credentials = await resolveStoreCredentials(identifier)
  const result = await shopifyFetch(credentials, method, path, body)

  if (!result.unauthorized) return { data: result.data, domain: credentials.domain }

  console.log(`${LOG_PREFIX} token for ${identifier} rejected, fetching a fresh one`)
  tokenCache.delete(identifier)
  const freshCredentials = await resolveStoreCredentials(identifier)
  const retry = await shopifyFetch(freshCredentials, method, path, body)

  if (retry.unauthorized) {
    throw new Error(`Shopify API ${method} ${path} failed (401): the store's access token was rejected.`)
  }

  return { data: retry.data, domain: freshCredentials.domain }
}

async function graphqlRequest(store, query, variables = {}) {
  const { data, domain } = await storeRequest(store, 'POST', '/graphql.json', { query, variables })

  if (data.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`)
  }

  return { data: data.data, domain }
}

export async function getOrder(orderId, store) {
  const { data, domain } = await storeRequest(store, 'GET', `/orders/${orderId}.json`)
  const o = data.order
  console.log(`${LOG_PREFIX} getOrder(${orderId}) → #${o.order_number}`)
  return {
    id: o.id,
    orderNumber: o.order_number,
    name: o.name,
    email: o.email,
    phone: o.phone,
    financialStatus: o.financial_status,
    fulfillmentStatus: o.fulfillment_status,
    totalPrice: o.total_price,
    currency: o.currency,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    cancelledAt: o.cancelled_at,
    cancelReason: o.cancel_reason,
    customer: o.customer
      ? {
          id: o.customer.id,
          email: o.customer.email,
          firstName: o.customer.first_name,
          lastName: o.customer.last_name,
        }
      : null,
    lineItems: (o.line_items || []).map(li => ({
      id: li.id,
      title: li.title,
      variantTitle: li.variant_title,
      sku: li.sku,
      quantity: li.quantity,
      price: li.price,
    })),
    shippingAddress: o.shipping_address
      ? {
          city: o.shipping_address.city,
          province: o.shipping_address.province,
          country: o.shipping_address.country,
        }
      : null,
    fulfillments: (o.fulfillments || []).map(f => ({
      id: f.id,
      status: f.status,
      trackingNumber: f.tracking_number,
      trackingUrl: f.tracking_url,
      createdAt: f.created_at,
    })),
    refunds: (o.refunds || []).map(r => ({
      id: r.id,
      createdAt: r.created_at,
      note: r.note,
    })),
    tags: o.tags,
    note: o.note,
    storeDomain: domain,
  }
}

export async function searchOrders(query, store) {
  const params = new URLSearchParams({
    status: 'any',
    limit: '50',
  })

  if (query.includes('@') || query.includes('.')) {
    params.set('email', query)
  } else {
    params.set('name', query)
  }

  const { data, domain } = await storeRequest(store, 'GET', `/orders.json?${params}`)
  const orders = data.orders || []
  console.log(`${LOG_PREFIX} searchOrders("${query}") → ${orders.length} results`)
  return orders.map(o => ({
    id: o.id,
    orderNumber: o.order_number,
    name: o.name,
    email: o.email,
    financialStatus: o.financial_status,
    fulfillmentStatus: o.fulfillment_status,
    totalPrice: o.total_price,
    currency: o.currency,
    createdAt: o.created_at,
    storeDomain: domain,
  }))
}

export async function getProduct(productId, store) {
  const { data, domain } = await storeRequest(store, 'GET', `/products/${productId}.json`)
  const p = data.product
  console.log(`${LOG_PREFIX} getProduct(${productId}) → "${p.title}"`)
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    productType: p.product_type,
    vendor: p.vendor,
    tags: p.tags,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    variants: (p.variants || []).map(v => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      price: v.price,
      compareAtPrice: v.compare_at_price,
      inventoryQuantity: v.inventory_quantity,
      weight: v.weight,
      weightUnit: v.weight_unit,
    })),
    storeDomain: domain,
  }
}

export async function getWebhooks(store) {
  const { data } = await storeRequest(store, 'GET', '/webhooks.json')
  const webhooks = data.webhooks || []
  console.log(`${LOG_PREFIX} getWebhooks() → ${webhooks.length} webhooks`)
  return webhooks.map(w => ({
    id: w.id,
    topic: w.topic,
    address: w.address,
    format: w.format,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  }))
}

export async function graphqlQuery(query, variables = {}, store) {
  if (/\bmutation\b/i.test(query)) {
    throw new Error('Only read-only queries are allowed. Mutations are not permitted.')
  }

  const { data, domain } = await graphqlRequest(store, query, variables)
  console.log(`${LOG_PREFIX} graphqlQuery() → OK`)
  return { data, storeDomain: domain }
}
