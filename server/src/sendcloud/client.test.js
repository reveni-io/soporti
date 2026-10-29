import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getSendcloudAccounts = vi.fn()
const isSendcloudConfigured = vi.fn()
vi.mock('./settings.js', () => ({ getSendcloudAccounts, isSendcloudConfigured }))

const {
  listAccounts,
  searchParcels,
  getParcel,
  getTracking,
  listReturns,
  getReturn,
  listShippingMethods,
  isConfigured,
} = await import('./client.js')

const BASE_URL = 'https://panel.sendcloud.sc/api'
const EU = { id: 1, name: 'Acme EU', publicKey: 'eu-public-key', secretKey: 'eu-secret-key' }
const US = { id: 2, name: 'Acme US', publicKey: 'us-public-key', secretKey: 'us-secret-key' }
const PARCEL = {
  id: 501,
  status: { id: 3, message: 'En route to sorting center' },
  order_number: '1042',
  tracking_number: 'JVGL0612345',
  tracking_url: 'https://tracking.sendcloud.sc/forward?code=JVGL0612345',
  carrier: { code: 'dhl' },
  shipment: { id: 8, name: 'DHL Parcel Connect' },
  is_return: false,
  name: 'Carla Customer',
  company_name: '',
  email: 'carla@example.com',
  telephone: '+34600000000',
  address: 'Calle Mayor 1',
  address_2: '2B',
  postal_code: '28013',
  city: 'Madrid',
  country: { iso_2: 'ES' },
  date_created: '01-10-2026 10:00:00',
  date_updated: '02-10-2026 10:00:00',
  date_announced: '01-10-2026 11:00:00',
  external_reference: null,
  weight: '1.200',
  collo_count: 1,
  parcel_items: [{ description: 'Sneakers', quantity: 1, sku: 'SNK-42', value: '89.00' }],
  errors: {},
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }
}

function requestedUrl(index = 0) {
  return new URL(global.fetch.mock.calls[index][0])
}

function requestedAuthorization() {
  return global.fetch.mock.calls[0][1].headers.Authorization
}

function basic(account) {
  return `Basic ${Buffer.from(`${account.publicKey}:${account.secretKey}`).toString('base64')}`
}

beforeEach(() => {
  vi.clearAllMocks()
  getSendcloudAccounts.mockResolvedValue([EU])
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('account selection', () => {
  it('uses the only linked account when none is named', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ parcels: [], next: null }))

    const result = await searchParcels(null, { orderNumber: '1042' })

    expect(result.account).toBe('Acme EU')
    expect(requestedAuthorization()).toBe(basic(EU))
  })

  it('picks the named account, whatever its case', async () => {
    getSendcloudAccounts.mockResolvedValue([EU, US])
    global.fetch.mockResolvedValue(jsonResponse({ parcels: [], next: null }))

    const result = await searchParcels('acme us', { orderNumber: '1042' })

    expect(result.account).toBe('Acme US')
    expect(requestedAuthorization()).toBe(basic(US))
  })

  it('asks for an account when several are linked and none is named', async () => {
    getSendcloudAccounts.mockResolvedValue([EU, US])

    await expect(searchParcels(null, { orderNumber: '1042' })).rejects.toThrow(
      'Several Sendcloud accounts are linked ("Acme EU", "Acme US")'
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('names the linked accounts when the requested one does not exist', async () => {
    await expect(searchParcels('Globex', { orderNumber: '1042' })).rejects.toThrow(
      'There is no Sendcloud account named "Globex". Linked: "Acme EU".'
    )
  })

  it('points to /admin when no account is linked', async () => {
    getSendcloudAccounts.mockResolvedValue([])

    await expect(getParcel(null, '501')).rejects.toThrow(/\/admin → Sendcloud/)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('listAccounts', () => {
  it('lists the account names only', async () => {
    getSendcloudAccounts.mockResolvedValue([EU, US])

    expect(await listAccounts()).toEqual({ accounts: [{ name: 'Acme EU' }, { name: 'Acme US' }] })
  })
})

describe('searchParcels', () => {
  it('filters by order number and summarizes each parcel', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ parcels: [PARCEL], next: null }))

    const result = await searchParcels(null, { orderNumber: ' 1042 ', trackingNumber: null })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(requestedUrl().pathname).toBe('/api/v2/parcels')
    expect(Object.fromEntries(requestedUrl().searchParams)).toEqual({ order_number: '1042' })
    expect(result).toEqual({
      account: 'Acme EU',
      parcels: [
        {
          id: 501,
          status: 'En route to sorting center',
          orderNumber: '1042',
          trackingNumber: 'JVGL0612345',
          trackingUrl: 'https://tracking.sendcloud.sc/forward?code=JVGL0612345',
          carrier: 'dhl',
          shippingMethod: 'DHL Parcel Connect',
          isReturn: false,
          recipient: 'Carla Customer',
          createdAt: '01-10-2026 10:00:00',
          updatedAt: '02-10-2026 10:00:00',
        },
      ],
      truncated: false,
      nextCursor: null,
    })
  })

  it('passes the tracking number, the external reference and the cursor', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ parcels: [], next: null }))

    await searchParcels(null, { trackingNumber: 'JVGL0612345', externalReference: 'ext-1', cursor: 'abc' })

    expect(Object.fromEntries(requestedUrl().searchParams)).toEqual({
      tracking_number: 'JVGL0612345',
      external_reference: 'ext-1',
      cursor: 'abc',
    })
  })

  it('reads the next cursor out of the next page url', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({ parcels: [PARCEL], next: `${BASE_URL}/v2/parcels?cursor=cD0yMDE4&order_number=1042` })
    )

    const result = await searchParcels(null, { orderNumber: '1042' })

    expect(result.truncated).toBe(true)
    expect(result.nextCursor).toBe('cD0yMDE4')
  })

  it('keeps a bare next token as the cursor', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ parcels: [], next: 42 }))

    expect((await searchParcels(null, { orderNumber: '1042' })).nextCursor).toBe('42')
  })

  it('refuses a search without any filter', async () => {
    await expect(searchParcels(null, { orderNumber: '  ' })).rejects.toThrow(/order number, a tracking number/)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('getParcel', () => {
  it('returns the parcel with its recipient and items', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ parcel: PARCEL }))

    const parcel = await getParcel(null, ' 501 ')

    expect(requestedUrl().pathname).toBe('/api/v2/parcels/501')
    expect(parcel).toMatchObject({
      account: 'Acme EU',
      id: 501,
      statusId: 3,
      announcedAt: '01-10-2026 11:00:00',
      weight: '1.200',
      colli: 1,
      externalReference: null,
      recipient: {
        name: 'Carla Customer',
        company: null,
        email: 'carla@example.com',
        phone: '+34600000000',
        address: 'Calle Mayor 1, 2B',
        postalCode: '28013',
        city: 'Madrid',
        country: 'ES',
      },
      items: [{ description: 'Sneakers', quantity: 1, sku: 'SNK-42', value: '89.00' }],
      errors: [],
    })
  })

  it('refuses an id that is not a number', async () => {
    await expect(getParcel(null, '../users')).rejects.toThrow('"../users" is not a Sendcloud parcel id')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it.each([
    [401, /rejected the API keys/],
    [403, /not allowed to read that/],
    [404, /nothing at \/v2\/parcels\/501/],
    [500, /Sendcloud API \/v2\/parcels\/501 failed \(500\)/],
  ])('explains a %i from Sendcloud', async (status, message) => {
    global.fetch.mockResolvedValue(jsonResponse({ error: { message: 'nope' } }, status))

    await expect(getParcel(null, '501')).rejects.toThrow(message)
  })

  it('never puts the keys in an error', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ error: 'nope' }, 401))

    const error = await getParcel(null, '501').catch(err => err)

    expect(error.message).not.toContain(EU.secretKey)
  })
})

describe('getTracking', () => {
  it('returns the timeline of a tracking number', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        created_at: '2026-10-01T10:00:00Z',
        announced_at: '2026-10-01T11:00:00Z',
        updated_at: '2026-10-03T09:00:00Z',
        details: { expected_delivery_date: '2026-10-04', is_return: false, is_to_service_point: true },
        tracking_numbers: [
          { carrier_code: 'dhl', tracking_number: 'JVGL0612345', tracking_url: 'https://dhl.example/JVGL0612345' },
        ],
        events: [
          {
            event_at: '2026-10-03T09:00:00Z',
            event_type: 'carrier',
            phase: 'none',
            exception: 'delivery_delay',
            sub_status: 'none',
            status_type: 'warning',
            description: 'Delayed at the hub',
          },
        ],
      })
    )

    const tracking = await getTracking(null, 'JVGL0612345')

    expect(requestedUrl().pathname).toBe('/api/v3/parcels/tracking/JVGL0612345')
    expect(tracking).toEqual({
      account: 'Acme EU',
      trackingNumber: 'JVGL0612345',
      createdAt: '2026-10-01T10:00:00Z',
      announcedAt: '2026-10-01T11:00:00Z',
      updatedAt: '2026-10-03T09:00:00Z',
      expectedDeliveryDate: '2026-10-04',
      isReturn: false,
      toServicePoint: true,
      trackingNumbers: [
        { carrier: 'dhl', trackingNumber: 'JVGL0612345', trackingUrl: 'https://dhl.example/JVGL0612345' },
      ],
      events: [
        {
          at: '2026-10-03T09:00:00Z',
          phase: 'none',
          exception: 'delivery_delay',
          subStatus: 'none',
          statusType: 'warning',
          description: 'Delayed at the hub',
          source: 'carrier',
        },
      ],
    })
  })

  it('refuses a tracking number that could escape the path', async () => {
    await expect(getTracking(null, 'abc/../def')).rejects.toThrow('does not look like a tracking number')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('listReturns', () => {
  const RETURN = {
    id: 1751075,
    status: 'open',
    order_number: '1042',
    tracking_number: 'RET123',
    tracking_url: 'https://tracking.example/RET123',
    reason: { id: 2, description: 'Too small' },
    refund: { refund_type: 'money', message: 'Refund to card' },
    from_address: { name: 'Carla Customer', address_line_1: 'Calle Mayor', house_number: '1', country_code: 'ES' },
    to_address: { name: 'Acme Warehouse', company_name: 'Acme', city: 'Utrecht', country_code: 'NL' },
    status_history: [
      { carrier_update_timestamp: '2026-10-02T10:00:00Z', parent_status: 'announced', carrier_message: 'Label' },
      { carrier_update_timestamp: '2026-10-05T10:00:00Z', parent_status: 'delivered', carrier_message: 'Done' },
    ],
    created_at: '2026-10-02T09:00:00Z',
  }

  it('lists the returns of the last 30 days by default', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'))
    global.fetch.mockResolvedValue(jsonResponse({ data: [RETURN], next: null }))

    const result = await listReturns(null)

    expect(requestedUrl().pathname).toBe('/api/v3/returns')
    expect(Object.fromEntries(requestedUrl().searchParams)).toEqual({
      from_date: '2026-09-29 00:00:00',
      to_date: '2026-10-29 23:59:59',
      page_size: '40',
    })
    expect(result).toEqual({
      account: 'Acme EU',
      from: '2026-09-29',
      to: '2026-10-29',
      returns: [
        {
          id: 1751075,
          status: 'open',
          parcelStatus: 'delivered',
          orderNumber: '1042',
          trackingNumber: 'RET123',
          trackingUrl: 'https://tracking.example/RET123',
          reason: 'Too small',
          refundType: 'money',
          customer: 'Carla Customer',
          createdAt: '2026-10-02T09:00:00Z',
        },
      ],
      truncated: false,
      nextCursor: null,
    })
  })

  it('passes the window, the parcel status and the cursor', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ data: [], next: `${BASE_URL}/v3/returns?cursor=cj0xJnA9MzAw` }))

    const result = await listReturns(null, {
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      parcelStatus: 'delivered',
      cursor: 'abc',
    })

    expect(Object.fromEntries(requestedUrl().searchParams)).toEqual({
      from_date: '2026-09-01 00:00:00',
      to_date: '2026-09-30 23:59:59',
      parent_parcel_status: 'delivered',
      page_size: '40',
      cursor: 'abc',
    })
    expect(result.truncated).toBe(true)
    expect(result.nextCursor).toBe('cj0xJnA9MzAw')
  })

  it.each([
    [{ fromDate: '01/09/2026' }, /YYYY-MM-DD/],
    [{ toDate: '2026-13-45' }, /YYYY-MM-DD/],
    [{ fromDate: '2026-10-10', toDate: '2026-10-01' }, /after its end date/],
  ])('refuses the window %j', async (options, message) => {
    await expect(listReturns(null, options)).rejects.toThrow(message)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reads one return with its addresses and its history, newest first', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        ...RETURN,
        id: undefined,
        is_cancellable: true,
        label_cost: { value: '4.95', currency: 'EUR' },
        shipping_option: { code: 'postnl:standard' },
        parcel_items: [{ description: 'Sneakers', quantity: 1 }],
      })
    )

    const result = await getReturn(null, '1751075')

    expect(requestedUrl().pathname).toBe('/api/v3/returns/1751075')
    expect(result).toMatchObject({
      account: 'Acme EU',
      id: 1751075,
      isCancellable: true,
      refundMessage: 'Refund to card',
      shippingOption: 'postnl:standard',
      labelCost: { value: '4.95', currency: 'EUR' },
      returnFee: null,
      deliveredAt: null,
      from: { name: 'Carla Customer', address: 'Calle Mayor 1', country: 'ES', company: null },
      to: { name: 'Acme Warehouse', company: 'Acme', city: 'Utrecht', address: null },
      items: [{ description: 'Sneakers', quantity: 1, sku: null, value: null }],
      statusHistory: [
        { at: '2026-10-05T10:00:00Z', status: 'delivered', carrierMessage: 'Done' },
        { at: '2026-10-02T10:00:00Z', status: 'announced', carrierMessage: 'Label' },
      ],
    })
  })

  it('reads a return without addresses', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ status: 'requested' }))

    const result = await getReturn(null, '7')

    expect(result).toMatchObject({ id: 7, status: 'requested', from: null, to: null, statusHistory: [] })
  })
})

describe('listShippingMethods', () => {
  it('lists the methods with their destinations and the carriers in use', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse({
        shipping_methods: [
          {
            id: 8,
            name: 'DHL Parcel Connect',
            carrier: 'dhl',
            min_weight: '0.001',
            max_weight: '31.001',
            service_point_input: 'none',
            countries: [{ iso_2: 'DE' }, { iso_2: 'ES' }],
          },
          {
            id: 9,
            name: 'PostNL service point',
            carrier: 'postnl',
            service_point_input: 'required',
          },
        ],
      })
    )

    const result = await listShippingMethods(null, { isReturn: true, toCountry: 'de' })

    expect(requestedUrl().pathname).toBe('/api/v2/shipping_methods')
    expect(Object.fromEntries(requestedUrl().searchParams)).toEqual({ is_return: 'true', to_country: 'DE' })
    expect(result).toEqual({
      account: 'Acme EU',
      carriers: ['dhl', 'postnl'],
      shippingMethods: [
        {
          id: 8,
          name: 'DHL Parcel Connect',
          carrier: 'dhl',
          minWeight: '0.001',
          maxWeight: '31.001',
          toServicePoint: false,
          countries: ['DE', 'ES'],
        },
        {
          id: 9,
          name: 'PostNL service point',
          carrier: 'postnl',
          minWeight: null,
          maxWeight: null,
          toServicePoint: true,
          countries: [],
        },
      ],
    })
  })

  it('lists every method without filters', async () => {
    global.fetch.mockResolvedValue(jsonResponse({}))

    const result = await listShippingMethods(null)

    expect(requestedUrl().search).toBe('')
    expect(result.shippingMethods).toEqual([])
  })

  it('refuses a country that is not a two-letter code', async () => {
    await expect(listShippingMethods(null, { toCountry: 'Germany' })).rejects.toThrow('two-letter country code')
  })
})

describe('isConfigured', () => {
  it('follows the stored accounts', async () => {
    isSendcloudConfigured.mockResolvedValue(true)

    expect(await isConfigured()).toBe(true)
  })
})
