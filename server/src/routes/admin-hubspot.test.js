import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { DrizzleQueryError } from 'drizzle-orm'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))
vi.mock('../db/users.js', () => ({ findUserById: vi.fn() }))

const { _resetHubspotSettingsCacheForTests } = await import('../hubspot/settings.js')
const { _resetHubspotClientCachesForTests } = await import('../hubspot/client.js')
const { describeHubspotAreas } = await import('../hubspot/permissions.js')
const { default: adminHubspotRouter } = await import('./admin-hubspot.js')

const app = express()
app.use(express.json())
app.use('/api/admin/config/hubspot', adminHubspotRouter)

const TOKEN = 'test-hubspot-service-key'
const ROTATED_TOKEN = 'pat-eu1-rotated-7d1e'
const ALL_READ = {
  contacts: 'read',
  companies: 'read',
  deals: 'read',
  tickets: 'read',
  activities: 'read',
  commerce: 'read',
  custom: 'read',
  lists: 'read',
  conversations: 'read',
  marketing: 'read',
}
const ALL_OFF = Object.fromEntries(Object.keys(ALL_READ).map(area => [area, 'off']))
const DEALS_ONLY = { ...ALL_OFF, deals: 'write' }
const ACCOUNT_URL = 'https://api.hubapi.com/account-info/2026-09/details'
const ACCOUNT = {
  portalId: 26789012,
  uiDomain: 'app-eu1.hubspot.com',
  dataHostingLocation: 'eu1',
  accountType: 'STANDARD',
  companyCurrency: 'EUR',
}
const DETAILS = { portalId: 26789012, uiDomain: 'app-eu1.hubspot.com', dataHostingLocation: 'eu1' }
const NOT_CONFIGURED = 'HubSpot is not configured. An admin has to add a Service Key in /admin → HubSpot.'
const REJECTED =
  'HubSpot rejected the key (401): it is invalid, expired or was revoked. An admin has to add a Service Key in /admin → HubSpot.'
const UPSERT_SQL =
  'insert into "app_config" ("key", "value", "updated_at") values ($1, $2, $3) on conflict ("key") do update set "value" = $4, "updated_at" = $5'

let stored = {}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function failedSave(params, cause) {
  return new DrizzleQueryError(UPSERT_SQL, params, cause)
}

function loggedText() {
  return JSON.stringify(console.error.mock.calls.map(call => call.map(String)))
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetHubspotSettingsCacheForTests()
  _resetHubspotClientCachesForTests()
  stored = { hubspot_token: TOKEN, hubspot_permissions: DEALS_ONLY }
  getConfigValue.mockImplementation(async key => stored[key] ?? null)
  setConfigValue.mockImplementation(async (key, value) => {
    stored[key] = value
  })
  global.fetch = vi.fn().mockImplementation(async () => jsonResponse(ACCOUNT))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/admin/config/hubspot', () => {
  it('reports the settings and the scopes they need without the key', async () => {
    const res = await request(app).get('/api/admin/config/hubspot')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      tokenConfigured: true,
      permissions: DEALS_ONLY,
      areas: describeHubspotAreas(),
      requiredScopes: ['crm.objects.deals.read', 'crm.objects.deals.write', 'crm.objects.owners.read'],
    })
    expect(JSON.stringify(res.body)).not.toContain(TOKEN)
  })

  it('reports no key and every area readable when nothing is stored', async () => {
    stored = {}

    const res = await request(app).get('/api/admin/config/hubspot')

    expect(res.status).toBe(200)
    expect(res.body.tokenConfigured).toBe(false)
    expect(res.body.permissions).toEqual(ALL_READ)
    expect(res.body.requiredScopes).toContain('crm.objects.contacts.read')
    expect(res.body.requiredScopes).not.toContain('crm.objects.contacts.write')
  })

  it('answers 500 when the settings cannot be read', async () => {
    getConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/config/hubspot')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to load the HubSpot settings.' })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('Failed to load the HubSpot settings:', expect.any(Error))
  })
})

describe('PUT /api/admin/config/hubspot/token', () => {
  it('stores the trimmed key and only says it is configured', async () => {
    const res = await request(app)
      .put('/api/admin/config/hubspot/token')
      .send({ token: `  ${TOKEN}  ` })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: true })
    expect(setConfigValue).toHaveBeenCalledTimes(1)
    expect(setConfigValue).toHaveBeenCalledWith('hubspot_token', TOKEN)
  })

  it('clears the key when it is empty', async () => {
    const res = await request(app).put('/api/admin/config/hubspot/token').send({ token: '   ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: false })
    expect(setConfigValue).toHaveBeenCalledTimes(1)
    expect(setConfigValue).toHaveBeenCalledWith('hubspot_token', '')
    expect((await request(app).get('/api/admin/config/hubspot')).body.tokenConfigured).toBe(false)
  })

  it.each([
    ['no key', {}, 'The HubSpot key must be a string (empty to clear it).'],
    ['a number', { token: 42 }, 'The HubSpot key must be a string (empty to clear it).'],
    [
      'a key with spaces inside',
      { token: 'pat eu1' },
      'The HubSpot key must be a single value without spaces, up to 500 characters.',
    ],
    [
      'a key over 500 characters',
      { token: 'p'.repeat(501) },
      'The HubSpot key must be a single value without spaces, up to 500 characters.',
    ],
  ])('answers 400 for %s without saving it', async (_case, body, error) => {
    const res = await request(app).put('/api/admin/config/hubspot/token').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('answers 500 and never logs the key the failed save carried', async () => {
    setConfigValue.mockRejectedValue(
      failedSave(['hubspot_token', TOKEN], new Error('Connection terminated unexpectedly'))
    )

    const res = await request(app).put('/api/admin/config/hubspot/token').send({ token: TOKEN })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the HubSpot key.' })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('Failed to save the HubSpot key:', 'Connection terminated unexpectedly')
    expect(loggedText()).not.toContain(TOKEN)
  })

  it('logs only the error name when the failure has no cause', async () => {
    setConfigValue.mockRejectedValue(failedSave(['hubspot_token', TOKEN], undefined))

    await request(app).put('/api/admin/config/hubspot/token').send({ token: TOKEN })

    expect(console.error).toHaveBeenCalledWith('Failed to save the HubSpot key:', 'Error')
    expect(loggedText()).not.toContain(TOKEN)
  })
})

describe('PUT /api/admin/config/hubspot/permissions', () => {
  it('merges a partial map over the defaults and saves it', async () => {
    const res = await request(app)
      .put('/api/admin/config/hubspot/permissions')
      .send({ permissions: { deals: 'full', marketing: 'off' } })

    const permissions = { ...ALL_READ, deals: 'full', marketing: 'off' }
    expect(res.status).toBe(200)
    expect(res.body.permissions).toEqual(permissions)
    expect(res.body.requiredScopes).toContain('crm.objects.deals.write')
    expect(res.body.requiredScopes).not.toContain('marketing.campaigns.read')
    expect(setConfigValue).toHaveBeenCalledTimes(1)
    expect(setConfigValue).toHaveBeenCalledWith('hubspot_permissions', permissions)
  })

  it('returns exactly the scopes the new selection needs', async () => {
    const res = await request(app)
      .put('/api/admin/config/hubspot/permissions')
      .send({ permissions: { ...ALL_OFF, conversations: 'reply' } })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      permissions: { ...ALL_OFF, conversations: 'reply' },
      requiredScopes: ['conversations.read', 'conversations.write', 'crm.objects.owners.read'],
    })
  })

  it.each([
    ['no map', {}, 'HubSpot permissions must be an object mapping each area to a level.'],
    ['a list', { permissions: ['deals'] }, 'HubSpot permissions must be an object mapping each area to a level.'],
    ['an unknown area', { permissions: { leads: 'read' } }, 'Unknown HubSpot area "leads".'],
    [
      'a level the area does not admit',
      { permissions: { marketing: 'write' } },
      'Invalid level for Marketing: use off, read.',
    ],
    [
      'reply on an object area',
      { permissions: { deals: 'reply' } },
      'Invalid level for Deals: use off, read, write, full.',
    ],
  ])('answers 400 for %s without saving it', async (_case, body, error) => {
    const res = await request(app).put('/api/admin/config/hubspot/permissions').send(body)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error })
    expect(setConfigValue).not.toHaveBeenCalled()
  })

  it('answers 500 when the permissions cannot be saved', async () => {
    setConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app)
      .put('/api/admin/config/hubspot/permissions')
      .send({ permissions: { deals: 'write' } })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the HubSpot permissions.' })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('Failed to save the HubSpot permissions:', expect.any(Error))
  })
})

describe('POST /api/admin/config/hubspot/test', () => {
  it('returns the portal details and nothing else', async () => {
    const res = await request(app).post('/api/admin/config/hubspot/test')

    expect(res.status).toBe(200)
    expect(res.body).toEqual(DETAILS)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(ACCOUNT_URL)
    expect(JSON.stringify(res.body)).not.toContain(TOKEN)
  })

  it('asks HubSpot on every test, so a key revoked since the last one is noticed', async () => {
    expect((await request(app).post('/api/admin/config/hubspot/test')).status).toBe(200)
    global.fetch.mockResolvedValue(jsonResponse({ category: 'INVALID_AUTHENTICATION' }, 401))

    const res = await request(app).post('/api/admin/config/hubspot/test')

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: REJECTED })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('tests the new key right after it is saved', async () => {
    await request(app).post('/api/admin/config/hubspot/test')
    await request(app).put('/api/admin/config/hubspot/token').send({ token: ROTATED_TOKEN })

    await request(app).post('/api/admin/config/hubspot/test')

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${ROTATED_TOKEN}`)
  })

  it('answers 422 without calling HubSpot when no key is stored', async () => {
    stored = {}

    const res = await request(app).post('/api/admin/config/hubspot/test')

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: NOT_CONFIGURED })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each([
    [401, REJECTED],
    [403, 'HubSpot refused the request (403): the key is not allowed to do that in this account.'],
    [503, 'HubSpot is not answering properly right now (503): try again later.'],
  ])('answers 422 in its own words when HubSpot answers %i', async (status, error) => {
    global.fetch.mockResolvedValue(jsonResponse({ message: `Key ${TOKEN} is not valid for this portal` }, status))

    const res = await request(app).post('/api/admin/config/hubspot/test')

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error })
    expect(JSON.stringify(res.body)).not.toContain(TOKEN)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('answers 422 when HubSpot cannot be reached', async () => {
    global.fetch.mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }))

    const res = await request(app).post('/api/admin/config/hubspot/test')

    expect(res.status).toBe(422)
    expect(res.body).toEqual({ error: 'HubSpot could not be reached: try again later.' })
    expect(loggedText()).not.toContain(TOKEN)
  })

  it('answers 500 without details when the key cannot be read', async () => {
    getConfigValue.mockRejectedValue(new Error('db down'))

    const res = await request(app).post('/api/admin/config/hubspot/test')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to test the HubSpot connection.' })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('Failed to test the HubSpot connection:', expect.any(Error))
  })
})
