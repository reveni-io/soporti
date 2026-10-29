import { getSendcloudAccounts, isSendcloudConfigured } from './settings.js'

const API_BASE_URL = 'https://panel.sendcloud.sc/api'
const SERVICE_POINTS_BASE_URL = 'https://servicepoints.sendcloud.sc/api'
const REQUEST_TIMEOUT_MS = 15_000
const RETURNS_PAGE_SIZE = 40
const DEFAULT_RETURNS_WINDOW_DAYS = 30
const MAX_LISTED_CUSTOMER_MESSAGE_CHARS = 500
const TRUNCATION_MARK = '…'
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
const ABORT_ERROR = 'AbortError'
const MS_PER_SECOND = 1000
const TIMEOUT_MESSAGE = `Sendcloud did not answer within ${REQUEST_TIMEOUT_MS / MS_PER_SECOND} seconds: try again later.`
const UNREACHABLE_MESSAGE = 'Sendcloud could not be reached: try again later.'
const UNFOLLOWABLE_PAGE_NOTICE =
  'Sendcloud reports more results, but its link to the next page carries no cursor this tool can follow: tell the user the list is incomplete.'
const PARCEL_FILTERS = {
  orderNumber: 'order_number',
  trackingNumber: 'tracking_number',
  externalReference: 'external_reference',
}
const CARRIER_RE = /^[a-z0-9_]{1,50}$/
const POSTAL_CODE_RE = /^[A-Za-z0-9 -]{1,12}$/
const MAX_TEXT_CHARS = 100
const GRAMS_PER_KG = 1000
const MAX_SERVICE_POINTS = 20
const CLOSED_LABEL = 'closed'
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const ADDRESS_FIELDS = {
  addressLine1: 'address_line_1',
  houseNumber: 'house_number',
  addressLine2: 'address_line_2',
  postalCode: 'postal_code',
  city: 'city',
  stateProvinceCode: 'state_province_code',
}

function authorization({ publicKey, secretKey }) {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`
}

function buildInit(account, { signal, body }) {
  const headers = { Authorization: authorization(account), Accept: 'application/json' }
  if (!body) return { signal, headers }

  return {
    method: 'POST',
    signal,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
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

async function send(account, path, { baseUrl, signal, body }) {
  try {
    return await fetch(`${baseUrl}${path}`, buildInit(account, { signal, body }))
  } catch (err) {
    console.error(`Failed to reach Sendcloud at ${path}:`, err.cause?.code ?? err.name)
    throw new Error(err.name === ABORT_ERROR ? TIMEOUT_MESSAGE : UNREACHABLE_MESSAGE, { cause: err })
  }
}

async function readBody(res, path) {
  try {
    return await res.json()
  } catch (err) {
    if (err.name === ABORT_ERROR) throw new Error(TIMEOUT_MESSAGE, { cause: err })

    throw new Error(`Sendcloud answered ${path} with something that is not JSON: try again later.`, { cause: err })
  }
}

async function request(account, path, { baseUrl = API_BASE_URL, body = null } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await send(account, path, { baseUrl, signal: controller.signal, body })

    if (!res.ok) {
      await res.body?.cancel()
      throw new Error(describeFailure(res.status, path))
    }

    return await readBody(res, path)
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

function hasNextPage(next) {
  return next !== null && next !== undefined && next !== ''
}

function cursorFrom(next) {
  if (!URL.canParse(next)) return String(next)

  return new URL(next).searchParams.get('cursor') || null
}

function toPage(next) {
  if (!hasNextPage(next)) return { truncated: false, nextCursor: null }

  const nextCursor = cursorFrom(next)
  if (!nextCursor) return { truncated: true, nextCursor: null, notice: UNFOLLOWABLE_PAGE_NOTICE }

  return { truncated: true, nextCursor }
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
    servicePointId: parcel.to_service_point ?? null,
    contractId: parcel.contract ?? null,
    documents: (parcel.documents || []).map(document => document.type).filter(Boolean),
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

function capCustomerMessage(message) {
  if (!message) return null
  if (message.length <= MAX_LISTED_CUSTOMER_MESSAGE_CHARS) return message

  return `${message.slice(0, MAX_LISTED_CUSTOMER_MESSAGE_CHARS)}${TRUNCATION_MARK}`
}

function toReturnItemSummary(item) {
  return {
    description: item.description ?? null,
    quantity: item.quantity ?? null,
    sku: item.sku || null,
    customerMessage: capCustomerMessage(item.return_message),
  }
}

function toReturnSummary(item) {
  const [latest] = newestFirst(item.status_history, 'carrier_update_timestamp')

  return {
    status: item.status ?? null,
    parcelStatus: latest?.parent_status ?? null,
    parcelStatusAt: latest?.carrier_update_timestamp ?? null,
    orderNumber: item.order_number || null,
    trackingNumber: item.tracking_number || null,
    trackingUrl: item.tracking_url || null,
    reason: item.reason?.description ?? null,
    refundType: item.refund?.refund_type ?? null,
    customer: item.from_address?.name ?? null,
    createdAt: item.created_at ?? null,
    deliveredAt: item.delivered_at_iso ?? null,
    items: (item.parcel_items || []).map(toReturnItemSummary),
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

function isCalendarDay(raw) {
  const time = Date.parse(raw)

  return !Number.isNaN(time) && isoDay(time) === raw
}

function parseDate(value, label) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (!DATE_RE.test(raw) || !isCalendarDay(raw)) {
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

function requireValue(value, label) {
  if (value === null) throw new Error(`Give the ${label}.`)

  return value
}

function parseOptionalId(value, label) {
  if (!String(value ?? '').trim()) return null

  return parseNumericId(value, label)
}

function parseCarrier(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!raw) return null
  if (!CARRIER_RE.test(raw)) throw new Error(`"${raw}" is not a Sendcloud carrier code, e.g. "dhl" or "correos".`)

  return raw
}

function parsePostalCode(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (!POSTAL_CODE_RE.test(raw)) throw new Error(`"${raw}" does not look like a postal code.`)

  return raw
}

function parseText(value, label) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (raw.length > MAX_TEXT_CHARS) throw new Error(`The ${label} is too long (max ${MAX_TEXT_CHARS} characters).`)

  return raw
}

function withoutEmpty(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null))
}

function toPickup(pickup) {
  return {
    id: pickup.id ?? null,
    status: pickup.pickup_status ?? null,
    carrier: pickup.carrier ?? null,
    pickupFrom: pickup.pickup_from ?? null,
    pickupUntil: pickup.pickup_until ?? null,
    trackingNumber: pickup.tracking_number || null,
    reference: pickup.reference || null,
    quantity: pickup.quantity ?? null,
    totalWeight: pickup.total_weight ?? null,
    contractId: pickup.contract ?? null,
    createdAt: pickup.created_at ?? null,
    cancelledAt: pickup.cancelled_at ?? null,
    name: pickup.name || null,
    address: [pickup.address, pickup.address_2].filter(Boolean).join(', ') || null,
    postalCode: pickup.postal_code ?? null,
    city: pickup.city ?? null,
    country: pickup.country ?? null,
    specialInstructions: pickup.special_instructions || null,
  }
}

function kilograms(grams) {
  if (grams === null || grams === undefined || grams === '') return null

  const value = Number(grams)
  return Number.isFinite(value) ? value / GRAMS_PER_KG : null
}

function toWeightRangeKg(range) {
  if (!range) return null

  return { min: kilograms(range.min_weight), max: kilograms(range.max_weight) }
}

function enabledFunctionalities(functionalities) {
  return Object.fromEntries(
    Object.entries(functionalities || {}).filter(([, value]) => value !== null && value !== false)
  )
}

function toProductMethod(method) {
  return {
    id: method.id,
    name: method.name ?? null,
    productCode: method.shipping_product_code ?? null,
    weightKg: toWeightRangeKg(method.properties),
    functionalities: enabledFunctionalities(method.functionalities),
  }
}

function toShippingProduct(product) {
  return {
    code: product.code ?? null,
    name: product.name ?? null,
    carrier: product.carrier ?? null,
    servicePointsCarrier: product.service_points_carrier ?? null,
    weightKg: toWeightRangeKg(product.weight_range),
    methods: (product.methods || []).map(toProductMethod),
  }
}

function toOpeningTimes(formatted) {
  if (!formatted) return null

  return Object.fromEntries(WEEKDAYS.map((day, index) => [day, (formatted[index] || []).join(', ') || CLOSED_LABEL]))
}

function toServicePoint(point) {
  return {
    id: point.id,
    code: point.code ?? null,
    name: point.name ?? null,
    carrier: point.carrier ?? null,
    shopType: point.shop_type ?? null,
    isActive: point.is_active ?? null,
    address: [point.street, point.house_number].filter(Boolean).join(' ') || null,
    postalCode: point.postal_code ?? null,
    city: point.city ?? null,
    country: point.country ?? null,
    distanceMeters: point.distance ?? null,
    openingTimes: toOpeningTimes(point.formatted_opening_times),
  }
}

function parseAddressToValidate(input) {
  const address = {
    address_line_1: requireValue(parseText(input.addressLine1, 'address line'), 'address line'),
    house_number: parseText(input.houseNumber, 'house number'),
    address_line_2: parseText(input.addressLine2, 'second address line'),
    postal_code: requireValue(parsePostalCode(input.postalCode), 'postal code'),
    city: requireValue(parseText(input.city, 'city'), 'city'),
    country_code: requireValue(parseCountry(input.countryCode), 'country'),
    state_province_code: parseText(input.stateProvinceCode, 'state or province code'),
  }

  return { address: withoutEmpty(address), carrier_code: requireValue(parseCarrier(input.carrier), 'carrier code') }
}

function toValidatedAddress(address) {
  if (!address) return null

  return Object.fromEntries(Object.entries(ADDRESS_FIELDS).map(([field, key]) => [field, address[key] || null]))
}

function toAddressResult(result) {
  return {
    recommended: Boolean(result.recommended),
    address: toValidatedAddress(result.address),
    reasons: result.analysis?.validation_result?.reasons ?? [],
  }
}

function toIntegration(integration) {
  return {
    id: integration.id ?? null,
    shopName: integration.shop_name ?? null,
    system: integration.system ?? null,
    webhookActive: integration.webhook_active ?? null,
    failingSince: integration.failing_since ?? null,
    lastFetch: integration.last_fetch ?? null,
    lastUpdatedAt: integration.last_updated_at ?? null,
    servicePointEnabled: integration.service_point_enabled ?? null,
    servicePointCarriers: integration.service_point_carriers ?? [],
  }
}

export async function listAccounts() {
  const accounts = await getSendcloudAccounts()

  return { accounts: accounts.map(account => ({ name: account.name })) }
}

export async function searchParcels(accountName, filters = {}) {
  const account = await resolveAccount(accountName)
  const params = parseParcelFilters(filters)

  const data = await request(account, `/v2/parcels${query({ ...params, cursor: filters.cursor })}`)

  return {
    account: account.name,
    parcels: (data.parcels || []).map(toParcelSummary),
    ...toPage(data.next),
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

  return {
    account: account.name,
    from,
    to,
    returns: (data.data || []).map(toReturnSummary),
    ...toPage(data.next),
  }
}

export async function getReturn(accountName, returnId) {
  const account = await resolveAccount(accountName)
  const id = parseNumericId(returnId, 'return')

  const data = await request(account, `/v3/returns/${id}`)

  return { account: account.name, id: Number(id), ...toReturn(data) }
}

export async function listShippingMethods(accountName, options = {}) {
  const account = await resolveAccount(accountName)
  const params = {
    is_return: options.isReturn ? 'true' : '',
    from_country: parseCountry(options.fromCountry),
    from_postal_code: parsePostalCode(options.fromPostalCode),
    to_country: parseCountry(options.toCountry),
    to_postal_code: parsePostalCode(options.toPostalCode),
  }

  const data = await request(account, `/v2/shipping_methods${query(params)}`)
  const methods = (data.shipping_methods || []).map(toShippingMethod)

  return {
    account: account.name,
    carriers: [...new Set(methods.map(method => method.carrier).filter(Boolean))].sort(),
    shippingMethods: methods,
  }
}

export async function listShippingProducts(accountName, options = {}) {
  const account = await resolveAccount(accountName)
  const params = {
    from_country: requireValue(parseCountry(options.fromCountry), 'origin country'),
    from_postal_code: parsePostalCode(options.fromPostalCode),
    to_country: parseCountry(options.toCountry),
    to_postal_code: parsePostalCode(options.toPostalCode),
    carrier: parseCarrier(options.carrier),
    contract: parseOptionalId(options.contractId, 'contract'),
    returns: options.isReturn ? 'true' : 'false',
  }

  const data = await request(account, `/v2/shipping-products${query(params)}`)

  return { account: account.name, products: (Array.isArray(data) ? data : []).map(toShippingProduct) }
}

export async function getPickup(accountName, pickupId) {
  const account = await resolveAccount(accountName)
  const id = parseNumericId(pickupId, 'pickup')

  const data = await request(account, `/v2/pickups/${id}`)

  return { account: account.name, ...toPickup(data) }
}

export async function searchServicePoints(accountName, options = {}) {
  const account = await resolveAccount(accountName)
  const params = {
    country: requireValue(parseCountry(options.country), 'country'),
    carrier: parseCarrier(options.carrier),
    city: parseText(options.city, 'city'),
    address: parseText(options.address, 'address'),
  }

  const data = await request(account, `/v2/service-points${query(params)}`, { baseUrl: SERVICE_POINTS_BASE_URL })
  const points = Array.isArray(data) ? data : []

  return {
    account: account.name,
    servicePoints: points.slice(0, MAX_SERVICE_POINTS).map(toServicePoint),
    total: points.length,
    truncated: points.length > MAX_SERVICE_POINTS,
  }
}

export async function getServicePoint(accountName, servicePointId) {
  const account = await resolveAccount(accountName)
  const id = parseNumericId(servicePointId, 'service point')

  const data = await request(account, `/v2/service-points/${id}`, { baseUrl: SERVICE_POINTS_BASE_URL })

  return { account: account.name, ...toServicePoint(data) }
}

export async function validateAddress(accountName, input = {}) {
  const account = await resolveAccount(accountName)
  const body = parseAddressToValidate(input)

  const data = await request(account, '/v3/addresses/validate', { body })

  return {
    account: account.name,
    isValid: Boolean(data.input_address_is_valid),
    results: (data.results || []).map(toAddressResult),
  }
}

export async function getIntegration(accountName, integrationId) {
  const account = await resolveAccount(accountName)
  const id = parseNumericId(integrationId, 'integration')

  const data = await request(account, `/v3/integrations/${id}`)

  return { account: account.name, ...toIntegration(data.data || {}) }
}

export async function isConfigured() {
  return isSendcloudConfigured()
}
