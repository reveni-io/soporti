import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getConfigValue = vi.fn()
const setConfigValue = vi.fn()
vi.mock('../db/app-config.js', () => ({ getConfigValue, setConfigValue }))

const findUserById = vi.fn()
vi.mock('../db/users.js', () => ({ findUserById }))

const {
  parseHubspotToken,
  getHubspotToken,
  setHubspotToken,
  getHubspotPermissions,
  setHubspotPermissions,
  isHubspotConfigured,
  resolveHubspotAccess,
  _resetHubspotSettingsCacheForTests,
} = await import('./settings.js')

const TOKEN = 'test-hubspot-service-key'
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
const REPLY_PERMISSIONS = { ...ALL_READ, conversations: 'reply' }
const WEB_USER = { id: 7, email: 'ana@example.com', name: 'Ana' }
const SLACK_USER = { id: 8, email: null, name: 'ana.slack' }

let stored = {}

beforeEach(() => {
  vi.clearAllMocks()
  _resetHubspotSettingsCacheForTests()
  stored = {}
  getConfigValue.mockImplementation(async key => stored[key] ?? null)
  setConfigValue.mockImplementation(async (key, value) => {
    stored[key] = value
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('parseHubspotToken', () => {
  it('trims the key', () => {
    expect(parseHubspotToken(`  ${TOKEN}\n`)).toEqual({ value: TOKEN })
  })

  it('turns an empty or blank value into a clear', () => {
    expect(parseHubspotToken('')).toEqual({ value: '' })
    expect(parseHubspotToken('   ')).toEqual({ value: '' })
  })

  it.each([undefined, null, 42, { token: TOKEN }])('rejects a value that is not a string: %j', value => {
    expect(parseHubspotToken(value)).toEqual({ error: 'The HubSpot key must be a string (empty to clear it).' })
  })

  it('rejects a key with spaces inside', () => {
    expect(parseHubspotToken('pat-eu1 0f6c3c2e')).toEqual({
      error: 'The HubSpot key must be a single value without spaces, up to 500 characters.',
    })
  })

  it('accepts up to 500 characters and rejects more', () => {
    expect(parseHubspotToken('k'.repeat(500))).toEqual({ value: 'k'.repeat(500) })
    expect(parseHubspotToken('k'.repeat(501))).toEqual({
      error: 'The HubSpot key must be a single value without spaces, up to 500 characters.',
    })
  })
})

describe('getHubspotToken', () => {
  it('returns the stored key', async () => {
    stored.hubspot_token = TOKEN

    expect(await getHubspotToken()).toBe(TOKEN)
    expect(getConfigValue).toHaveBeenCalledWith('hubspot_token')
  })

  it.each([undefined, '', { token: TOKEN }])('returns null for the stored value %j', async value => {
    stored.hubspot_token = value

    expect(await getHubspotToken()).toBeNull()
  })

  it('reads the key and the permissions once for both getters', async () => {
    stored.hubspot_token = TOKEN

    await getHubspotToken()
    await getHubspotPermissions()
    await getHubspotToken()

    expect(getConfigValue).toHaveBeenCalledTimes(2)
    expect(getConfigValue.mock.calls).toEqual([['hubspot_token'], ['hubspot_permissions']])
  })

  it('keeps the snapshot for a minute', async () => {
    vi.useFakeTimers()
    stored.hubspot_token = TOKEN
    await getHubspotToken()

    stored.hubspot_token = 'pat-eu1-rotated'
    vi.advanceTimersByTime(59_999)
    expect(await getHubspotToken()).toBe(TOKEN)

    vi.advanceTimersByTime(2)
    expect(await getHubspotToken()).toBe('pat-eu1-rotated')
    expect(getConfigValue).toHaveBeenCalledTimes(4)
  })
})

describe('setHubspotToken', () => {
  it('stores the key and the next read reflects it', async () => {
    expect(await getHubspotToken()).toBeNull()

    await setHubspotToken(TOKEN)

    expect(setConfigValue).toHaveBeenCalledTimes(1)
    expect(setConfigValue).toHaveBeenCalledWith('hubspot_token', TOKEN)
    expect(await getHubspotToken()).toBe(TOKEN)
  })

  it('clears the key on an empty string', async () => {
    stored.hubspot_token = TOKEN
    expect(await isHubspotConfigured()).toBe(true)

    await setHubspotToken('')

    expect(setConfigValue).toHaveBeenCalledWith('hubspot_token', '')
    expect(await isHubspotConfigured()).toBe(false)
  })

  it('drops the whole snapshot, permissions included', async () => {
    stored.hubspot_permissions = ALL_READ
    expect(await getHubspotPermissions()).toEqual(ALL_READ)

    stored.hubspot_permissions = { ...ALL_READ, deals: 'write' }
    await setHubspotToken(TOKEN)

    expect(await getHubspotPermissions()).toEqual({ ...ALL_READ, deals: 'write' })
  })
})

describe('getHubspotPermissions', () => {
  it('defaults every area to read when nothing is stored', async () => {
    expect(await getHubspotPermissions()).toEqual(ALL_READ)
    expect(getConfigValue).toHaveBeenCalledWith('hubspot_permissions')
  })

  it('normalizes what is stored', async () => {
    stored.hubspot_permissions = { deals: 'write', widgets: 'full', marketing: 'write' }

    expect(await getHubspotPermissions()).toEqual({ ...ALL_READ, deals: 'write' })
  })
})

describe('setHubspotPermissions', () => {
  it('stores the map merged over the defaults', async () => {
    await setHubspotPermissions({ deals: 'write', contacts: 'off', widgets: 'full' })

    expect(setConfigValue).toHaveBeenCalledTimes(1)
    expect(setConfigValue).toHaveBeenCalledWith('hubspot_permissions', { ...ALL_READ, deals: 'write', contacts: 'off' })
  })

  it('takes effect on the next read without waiting for the cache', async () => {
    stored.hubspot_token = 'pat-eu1-old'
    expect(await getHubspotPermissions()).toEqual(ALL_READ)

    stored.hubspot_token = TOKEN
    await setHubspotPermissions({ deals: 'write' })

    expect(await getHubspotPermissions()).toEqual({ ...ALL_READ, deals: 'write' })
    expect(await getHubspotToken()).toBe(TOKEN)
  })
})

describe('isHubspotConfigured', () => {
  it('is false without a key', async () => {
    stored.hubspot_permissions = REPLY_PERMISSIONS

    expect(await isHubspotConfigured()).toBe(false)
  })

  it('is true with a key', async () => {
    stored.hubspot_token = TOKEN

    expect(await isHubspotConfigured()).toBe(true)
  })
})

describe('resolveHubspotAccess', () => {
  it('returns null without a key and never looks the user up', async () => {
    stored.hubspot_permissions = REPLY_PERMISSIONS

    expect(await resolveHubspotAccess({ userId: WEB_USER.id, unattended: false })).toBeNull()
    expect(findUserById).not.toHaveBeenCalled()
  })

  it.each([
    { run: 'web', options: { userId: WEB_USER.id, unattended: false }, user: WEB_USER, attended: true, canReply: true },
    { run: 'web without options', options: { userId: WEB_USER.id }, user: WEB_USER, attended: true, canReply: true },
    { run: 'slack', options: { userId: SLACK_USER.id }, user: SLACK_USER, attended: true, canReply: false },
    { run: 'a deleted user', options: { userId: 99 }, user: null, attended: true, canReply: false },
  ])('resolves a $run run that can be looked up', async ({ options, user, attended, canReply }) => {
    stored.hubspot_token = TOKEN
    stored.hubspot_permissions = REPLY_PERMISSIONS
    findUserById.mockResolvedValue(user)

    expect(await resolveHubspotAccess(options)).toEqual({
      permissions: REPLY_PERMISSIONS,
      attended,
      delegated: false,
      canReply,
    })
    expect(findUserById).toHaveBeenCalledTimes(1)
    expect(findUserById).toHaveBeenCalledWith(options.userId)
  })

  it.each([
    { run: 'schedule', options: { userId: WEB_USER.id, unattended: true } },
    { run: 'auto-diagnose', options: { userId: undefined } },
    { run: 'auto-diagnose with a null user', options: { userId: null, unattended: false } },
  ])('marks a $run run as unattended without looking the user up', async ({ options }) => {
    stored.hubspot_token = TOKEN
    stored.hubspot_permissions = REPLY_PERMISSIONS
    findUserById.mockResolvedValue(WEB_USER)

    expect(await resolveHubspotAccess(options)).toEqual({
      permissions: REPLY_PERMISSIONS,
      attended: false,
      delegated: false,
      canReply: false,
    })
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('marks an mcp run as delegated and unattended without looking the user up', async () => {
    stored.hubspot_token = TOKEN
    stored.hubspot_permissions = REPLY_PERMISSIONS
    findUserById.mockResolvedValue(WEB_USER)

    expect(await resolveHubspotAccess({ userId: WEB_USER.id, unattended: false, delegated: true })).toEqual({
      permissions: REPLY_PERMISSIONS,
      attended: false,
      delegated: true,
      canReply: false,
    })
    expect(findUserById).not.toHaveBeenCalled()
  })

  it.each(['read', 'off'])('never looks the user up when conversations is %s', async level => {
    stored.hubspot_token = TOKEN
    stored.hubspot_permissions = { ...ALL_READ, conversations: level }
    findUserById.mockResolvedValue(WEB_USER)

    expect(await resolveHubspotAccess({ userId: WEB_USER.id, unattended: false })).toEqual({
      permissions: { ...ALL_READ, conversations: level },
      attended: true,
      delegated: false,
      canReply: false,
    })
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('hands out the normalized permissions', async () => {
    stored.hubspot_token = TOKEN
    stored.hubspot_permissions = { deals: 'full', widgets: 'write' }

    const access = await resolveHubspotAccess({ userId: undefined })

    expect(access.permissions).toEqual({ ...ALL_READ, deals: 'full' })
  })

  it('shares the cached snapshot with the other getters', async () => {
    stored.hubspot_token = TOKEN

    await isHubspotConfigured()
    await resolveHubspotAccess({ userId: undefined })

    expect(getConfigValue).toHaveBeenCalledTimes(2)
  })
})
