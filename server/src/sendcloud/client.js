import { getSendcloudAccounts, isSendcloudConfigured } from './settings.js'

const API_BASE_URL = 'https://panel.sendcloud.sc/api'
const REQUEST_TIMEOUT_MS = 15_000
const RETURNS_PAGE_SIZE = 40
const DEFAULT_RETURNS_WINDOW_DAYS = 30
const DAY_MS = 86_400_000
const NUMERIC_ID_RE = /^\d{1,15}$/
const TRACKING_NUMBER_RE = /^[A-Za-z0-9-]{1,64}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const COUNTRY_RE = /^[A-Za-z]{2}$/
const NOT_CONFIGURED_MESSAGE = 'Sendcloud is not configured. An admin has to link an account in /admin → Sendcloud.'
const REJECTED_MESSAGE =
  'Sendcloud rejected the API keys of this account. They may have been revoked — an admin has to link the account again in /admin → Sendcloud.'
const FORBIDDEN_MESSAGE = 'Sendcloud refused the request: the API keys of this account are not allowed to read that.'
const INVALID_REQUEST_STATUSES = new Set([400, 422])
const RATE_LIMITED_STATUS = 429
const SERVER_ERROR_STATUS = 500
const PARCEL_FILTERS = {
  orderNumber: 'order_number',
  trackingNumber: 'tracking_number',
  externalReference: 'external_reference',
}

function authorization({ publicKey, secretKey }) {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`
}

function describeFailure(status, path) {
  if (status === 401) return REJECTED_MESSAGE
  if (status === 403) return FORBIDDEN_MESSAGE
  if (status === 404) return `Sendcloud has nothing at ${path}: check the id or number and the account.`
  if (INVALID_REQUEST_STATUSES.has(status)) {
    return `Sendcloud refused the request to ${path} as invalid (${status}): check the filters, ids and dates.`
  }
  if (status === RATE_LIMITED_STATUS) {
    return 'Sendcloud is rate limiting this account (429): wait a moment and try again.'
  }
  if (status >= SERVER_ERROR_STATUS) {
    return `Sendcloud is not answering properly right now (${status}): try again later.`
  }

  return `Sendcloud API ${path} failed (${status}).`
}

async function request(account, path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Authorization: authorization(account), Accept: 'application/json' },
    })

    if (!res.ok) throw new Error(describeFailure(res.status, path))

    return res.json()
  } finally {
    clearTimeout(timer)
  }
}

function accountNames(accounts) {
  return accounts.map(account => `"${account.name}"`).join(', ')
}

function pickAccount(accounts, name) {
  const wanted = String(name ?? '').trim()

  if (!wanted && accounts.length === 1) return accounts[0]
  if (!wanted) {
    throw new Error(
      `Several Sendcloud accounts are linked (${accountNames(accounts)}): pass the one to query as \`account\`.`
    )
  }

  const match = accounts.find(account => account.name.toLowerCase() === wanted.toLowerCase())
  if (!match) throw new Error(`There is no Sendcloud account named "${wanted}". Linked: ${accountNames(accounts)}.`)

  return match
}

async function resolveAccount(name) {
  const accounts = await getSendcloudAccounts()
  if (accounts.length === 0) throw new Error(NOT_CONFIGURED_MESSAGE)

  return pickAccount(accounts, name)
}

function parseNumericId(value, label) {
  const raw = String(value ?? '').trim()
  if (!NUMERIC_ID_RE.test(raw)) throw new Error(`"${raw}" is not a Sendcloud ${label} id: it is a number.`)

  return raw
}

function parseTrackingNumber(value) {
  const raw = String(value ?? '').trim()
  if (!TRACKING_NUMBER_RE.test(raw)) throw new Error(`"${raw}" does not look like a tracking number.`)

  return raw
}

function cursorFrom(next) {
  if (next === null || next === undefined || next === '') return null
  if (!URL.canParse(next)) return String(next)

  return new URL(next).searchParams.get('cursor')
}

function query(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }

  const text = search.toString()
  return text ? `?${text}` : ''
}

function toRecipient(parcel) {
  return {
    name: parcel.name ?? null,
    company: parcel.company_name || null,
    email: parcel.email || null,
    phone: parcel.telephone || null,
    address: [parcel.address, parcel.address_2].filter(Boolean).join(', ') || null,
    postalCode: parcel.postal_code ?? null,
    city: parcel.city ?? null,
    country: parcel.country?.iso_2 ?? null,
  }
}

function toParcelSummary(parcel) {
  return {
    id: parcel.id,
    status: parcel.status?.message ?? null,
    orderNumber: parcel.order_number || null,
    trackingNumber: parcel.tracking_number || null,
    trackingUrl: parcel.tracking_url || null,
    carrier: parcel.carrier?.code ?? null,
    shippingMethod: parcel.shipment?.name ?? null,
    isReturn: Boolean(parcel.is_return),
    recipient: parcel.name ?? null,
    createdAt: parcel.date_created ?? null,
    updatedAt: parcel.date_updated ?? null,
  }
}

function toParcelItem(item) {
  return {
    description: item.description ?? null,
    quantity: item.quantity ?? null,
    sku: item.sku || null,
    value: item.value ?? null,
  }
}

function toParcel(parcel) {
  return {
    ...toParcelSummary(parcel),
    statusId: parcel.status?.id ?? null,
    externalReference: parcel.external_reference || null,
    announcedAt: parcel.date_announced ?? null,
    weight: parcel.weight ?? null,
    colli: parcel.collo_count ?? null,
    recipient: toRecipient(parcel),
    items: (parcel.parcel_items || []).map(toParcelItem),
    errors: parcel.errors?.non_field_errors ?? [],
  }
}

function parseParcelFilters(filters) {
  const entries = Object.entries(PARCEL_FILTERS)
    .map(([field, param]) => [param, String(filters[field] ?? '').trim()])
    .filter(([, value]) => value)

  if (entries.length === 0) {
    throw new Error('A Sendcloud parcel search needs an order number, a tracking number or an external reference.')
  }

  return Object.fromEntries(entries)
}

function toTrackingEvent(event) {
  return {
    at: event.event_at ?? null,
    phase: event.phase ?? null,
    exception: event.exception ?? null,
    subStatus: event.sub_status ?? null,
    statusType: event.status_type ?? null,
    description: event.description ?? null,
    source: event.event_type ?? null,
  }
}

function toTrackingNumber(entry) {
  return {
    carrier: entry.carrier_code ?? null,
    trackingNumber: entry.tracking_number ?? null,
    trackingUrl: entry.tracking_url || null,
  }
}

function timestampOf(value) {
  const time = Date.parse(value ?? '')
  return Number.isNaN(time) ? 0 : time
}

function newestFirst(entries, field) {
  return [...(entries || [])].sort((left, right) => timestampOf(right[field]) - timestampOf(left[field]))
}

function toStatusEntry(entry) {
  return {
    at: entry.carrier_update_timestamp ?? null,
    status: entry.parent_status ?? null,
    carrierMessage: entry.carrier_message ?? null,
  }
}

function toAddress(address) {
  if (!address) return null

  return {
    name: address.name ?? null,
    company: address.company_name || null,
    email: address.email || null,
    phone: address.phone_number || null,
    address: [address.address_line_1, address.house_number, address.address_line_2].filter(Boolean).join(' ') || null,
    postalCode: address.postal_code ?? null,
    city: address.city ?? null,
    country: address.country_code ?? null,
  }
}

function toMoney(amount) {
  if (!amount) return null

  return { value: amount.value ?? null, currency: amount.currency ?? null }
}

function toReturnItem(item) {
  return {
    description: item.description ?? null,
    quantity: item.quantity ?? null,
    sku: item.sku || null,
    value: toMoney(item.value),
    returnReasonId: item.return_reason_id ?? null,
    customerMessage: item.return_message || null,
  }
}

function toReturn(item) {
  const history = newestFirst(item.status_history, 'carrier_update_timestamp')

  return {
    status: item.status ?? null,
    parcelStatus: history[0]?.parent_status ?? null,
    orderNumber: item.order_number || null,
    trackingNumber: item.tracking_number || null,
    trackingUrl: item.tracking_url || null,
    reason: item.reason?.description ?? null,
    refundType: item.refund?.refund_type ?? null,
    refundMessage: item.refund?.message || null,
    createdAt: item.created_at ?? null,
    deliveredAt: item.delivered_at_iso ?? null,
    isCancellable: Boolean(item.is_cancellable),
    from: toAddress(item.from_address),
    to: toAddress(item.to_address),
    shippingOption: item.shipping_option?.code ?? null,
    labelCost: toMoney(item.label_cost),
    returnFee: toMoney(item.return_fee),
    items: (item.parcel_items || []).map(toReturnItem),
    statusHistory: history.map(toStatusEntry),
  }
}

function parseDate(value, label) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (!DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new Error(`"${raw}" is not a valid ${label}: use YYYY-MM-DD.`)
  }

  return raw
}

function isoDay(time) {
  return new Date(time).toISOString().slice(0, 10)
}

function resolveReturnsWindow({ fromDate, toDate }) {
  const to = parseDate(toDate, 'end date') ?? isoDay(Date.now())
  const from = parseDate(fromDate, 'start date') ?? isoDay(Date.parse(to) - DEFAULT_RETURNS_WINDOW_DAYS * DAY_MS)

  if (from > to) throw new Error('The start date of the returns window is after its end date.')

  return { from, to }
}

function toShippingMethod(method) {
  return {
    id: method.id,
    name: method.name ?? null,
    carrier: method.carrier ?? null,
    minWeight: method.min_weight ?? null,
    maxWeight: method.max_weight ?? null,
    toServicePoint: method.service_point_input === 'required',
    countries: (method.countries || []).map(country => country.iso_2).filter(Boolean),
  }
}

function parseCountry(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (!COUNTRY_RE.test(raw)) throw new Error(`"${raw}" is not a two-letter country code.`)

  return raw.toUpperCase()
}

export async function listAccounts() {
  const accounts = await getSendcloudAccounts()

  return { accounts: accounts.map(account => ({ name: account.name })) }
}

export async function searchParcels(accountName, filters = {}) {
  const account = await resolveAccount(accountName)
  const params = parseParcelFilters(filters)

  const data = await request(account, `/v2/parcels${query({ ...params, cursor: filters.cursor })}`)
  const nextCursor = cursorFrom(data.next)

  return {
    account: account.name,
    parcels: (data.parcels || []).map(toParcelSummary),
    truncated: Boolean(nextCursor),
    nextCursor,
  }
}

export async function getParcel(accountName, parcelId) {
  const account = await resolveAccount(accountName)
  const id = parseNumericId(parcelId, 'parcel')

  const data = await request(account, `/v2/parcels/${id}`)

  return { account: account.name, ...toParcel(data.parcel || {}) }
}

export async function getTracking(accountName, trackingNumber) {
  const account = await resolveAccount(accountName)
  const number = parseTrackingNumber(trackingNumber)

  const data = await request(account, `/v3/parcels/tracking/${encodeURIComponent(number)}`)

  return {
    account: account.name,
    trackingNumber: number,
    createdAt: data.created_at ?? null,
    announcedAt: data.announced_at ?? null,
    updatedAt: data.updated_at ?? null,
    expectedDeliveryDate: data.details?.expected_delivery_date ?? null,
    isReturn: Boolean(data.details?.is_return),
    toServicePoint: Boolean(data.details?.is_to_service_point),
    trackingNumbers: (data.tracking_numbers || []).map(toTrackingNumber),
    events: newestFirst(data.events, 'event_at').map(toTrackingEvent),
  }
}

export async function listReturns(accountName, options = {}) {
  const account = await resolveAccount(accountName)
  const { from, to } = resolveReturnsWindow(options)

  const params = {
    from_date: `${from} 00:00:00`,
    to_date: `${to} 23:59:59`,
    parent_parcel_status: String(options.parcelStatus ?? '').trim(),
    page_size: RETURNS_PAGE_SIZE,
    cursor: options.cursor,
  }
  const data = await request(account, `/v3/returns${query(params)}`)
  const nextCursor = cursorFrom(data.next)

  return {
    account: account.name,
    from,
    to,
    returns: (data.data || []).map(toReturn),
    truncated: Boolean(nextCursor),
    nextCursor,
  }
}

export async function getReturn(accountName, returnId) {
  const account = await resolveAccount(accountName)
  const id = parseNumericId(returnId, 'return')

  const data = await request(account, `/v3/returns/${id}`)

  return { account: account.name, id: Number(id), ...toReturn(data) }
}

export async function listShippingMethods(accountName, { isReturn = false, toCountry = null } = {}) {
  const account = await resolveAccount(accountName)
  const country = parseCountry(toCountry)

  const params = { is_return: isReturn ? 'true' : '', to_country: country }
  const data = await request(account, `/v2/shipping_methods${query(params)}`)
  const methods = (data.shipping_methods || []).map(toShippingMethod)

  return {
    account: account.name,
    carriers: [...new Set(methods.map(method => method.carrier).filter(Boolean))].sort(),
    shippingMethods: methods,
  }
}

export async function isConfigured() {
  return isSendcloudConfigured()
}
