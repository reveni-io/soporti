import * as postgres from '../postgres/client.js'
import { getShopifyTokenQuery, STORE_PLACEHOLDER } from './settings.js'

const LOG_PREFIX = '[shopify]'
const REQUEST_TIMEOUT_MS = 15_000
const API_VERSION = '2024-10'
const TOKEN_CACHE_TTL_MS = 60_000

const tokenCache = new Map()

export async function isConfigured() {
  const [postgresConfigured, tokenQuery] = await Promise.all([postgres.isConfigured(), getShopifyTokenQuery()])
  return Boolean(postgresConfigured && tokenQuery)
}

function quoteSqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

async function resolveStoreCredentials(store) {
  const identifier = String(store ?? '').trim()
  if (!identifier) {
    throw new Error('A store identifier (domain or ID) must be provided')
  }

  const cached = tokenCache.get(identifier)
  if (cached && Date.now() - cached.ts < TOKEN_CACHE_TTL_MS) {
    console.log(`${LOG_PREFIX} getStoreToken(${identifier}) (cached)`)
    return cached.value
  }

  const template = await getShopifyTokenQuery()
  if (!template) {
    throw new Error('The Shopify store token query is not configured. An admin must set it in /admin → Shopify.')
  }

  console.log(`${LOG_PREFIX} getStoreToken(${identifier})`)
  const sql = template.replaceAll(STORE_PLACEHOLDER, quoteSqlLiteral(identifier))
  const result = await postgres.runQuery(sql)
  if (!result.rows.length) {
    throw new Error(
      `No Shopify credentials found for store "${identifier}". If this is the store's commercial name, resolve it to a domain or ID first (e.g. search the stores table by name with the database tools).`
    )
  }
  const row = result.rows[0]
  if (!row.domain || !row.token) {
    throw new Error('The configured Shopify token query must return "domain" and "token" columns.')
  }
  const value = { token: row.token, domain: row.domain }
  tokenCache.set(identifier, { value, ts: Date.now() })
  return value
}

function buildShopifyUrl(domain, path) {
  const cleanDomain = domain.includes('.myshopify.com') ? domain : `${domain}.myshopify.com`
  return `https://${cleanDomain}/admin/api/${API_VERSION}${path}`
}

async function shopifyFetch(token, domain, method, path, body) {
  const url = buildShopifyUrl(domain, path)
  console.log(`${LOG_PREFIX} ${method} ${url}`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const opts = {
      method,
      signal: controller.signal,
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    }
    if (body) opts.body = JSON.stringify(body)

    const res = await fetch(url, opts)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Shopify API ${method} ${path} failed (${res.status}): ${text}`)
    }

    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function request(token, domain, method, path) {
  return shopifyFetch(token, domain, method, path)
}

async function graphqlRequest(token, domain, query, variables = {}) {
  const data = await shopifyFetch(token, domain, 'POST', '/graphql.json', { query, variables })
  if (data.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`)
  }
  return data.data
}

export async function getOrder(orderId, store) {
  const { token, domain } = await resolveStoreCredentials(store)
  const data = await request(token, domain, 'GET', `/orders/${orderId}.json`)
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
  const { token, domain } = await resolveStoreCredentials(store)
  const params = new URLSearchParams({
    status: 'any',
    limit: '50',
  })

  if (query.includes('@') || query.includes('.')) {
    params.set('email', query)
  } else {
    params.set('name', query)
  }

  const data = await request(token, domain, 'GET', `/orders.json?${params}`)
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
  const { token, domain } = await resolveStoreCredentials(store)
  const data = await request(token, domain, 'GET', `/products/${productId}.json`)
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
  const { token, domain } = await resolveStoreCredentials(store)
  const data = await request(token, domain, 'GET', '/webhooks.json')
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

  const { token, domain } = await resolveStoreCredentials(store)

  const data = await graphqlRequest(token, domain, query, variables)
  console.log(`${LOG_PREFIX} graphqlQuery() → OK`)
  return { data, storeDomain: domain }
}
