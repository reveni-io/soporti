import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const countAdmins = vi.fn()
const setAdminCredentials = vi.fn()
const createUserWithPassword = vi.fn()
const listUsers = vi.fn()
const findUserByEmail = vi.fn()
const hashPassword = vi.fn(async () => 'hashed')
const getAllowedDomains = vi.fn()
const setAllowedDomains = vi.fn()
const createSession = vi.fn(() => 'session-token')
const verifySetupCode = vi.fn(() => true)
const announceSetupCode = vi.fn()
// Toggled per test: simulates the DB role check.
let currentDbRole = 'admin'
const requireAdmin = vi.fn(async (req, res, next) => {
  if (currentDbRole !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
  next()
})

vi.mock('../middleware/auth.js', () => ({ createSession, requireAdmin }))
vi.mock('../auth/password.js', async importOriginal => {
  const original = await importOriginal()
  return { ...original, hashPassword }
})
const getGithubToken = vi.fn()
const setGithubToken = vi.fn()
const getWebhookSecret = vi.fn()
const setWebhookSecret = vi.fn()
const getRepoCatalog = vi.fn()
const setRepoCatalog = vi.fn()

const getOpenAIApiKey = vi.fn()
const setOpenAIApiKey = vi.fn()
const getOpenAIModel = vi.fn()
const setOpenAIModel = vi.fn()
const getVectorStoreId = vi.fn()
const setVectorStoreId = vi.fn()

const getAuthMethods = vi.fn()
const setAuthMethods = vi.fn()

const getGoogleClientId = vi.fn()
const setGoogleClientId = vi.fn()

const getDriveCredentials = vi.fn()
const setDriveCredentials = vi.fn()

const getNotionToken = vi.fn()
const setNotionToken = vi.fn()
const getShortcutToken = vi.fn()
const setShortcutToken = vi.fn()

const getSentryToken = vi.fn()
const setSentryToken = vi.fn()
const getSentryOrg = vi.fn()
const setSentryOrg = vi.fn()

const getHelpjuiceApiKey = vi.fn()
const setHelpjuiceApiKey = vi.fn()
const getHelpjuiceAccount = vi.fn()
const setHelpjuiceAccount = vi.fn()

const getPostgresConnection = vi.fn()
const setPostgresConnection = vi.fn()
const getPostgresMaxRows = vi.fn()
const setPostgresMaxRows = vi.fn()

const getShopifyTokenQuery = vi.fn()
const setShopifyTokenQuery = vi.fn()
const draftShopifyTokenQuery = vi.fn()

const getSlackBotToken = vi.fn()
const setSlackBotToken = vi.fn()
const getSlackAppToken = vi.fn()
const setSlackAppToken = vi.fn()
const getSlackSigningSecret = vi.fn()
const setSlackSigningSecret = vi.fn()
const restartSlackBot = vi.fn(async () => null)

const clearStatsCache = vi.fn()

vi.mock('./stats.js', () => ({ clearStatsCache, default: {} }))
vi.mock('../auth/setup-code.js', () => ({ verifySetupCode, announceSetupCode }))
vi.mock('../auth/allowed-domains.js', () => ({ getAllowedDomains, setAllowedDomains }))
vi.mock('../auth/auth-methods.js', () => ({ getAuthMethods, setAuthMethods }))
vi.mock('../auth/google-settings.js', () => ({ getGoogleClientId, setGoogleClientId }))
vi.mock('../google-drive/settings.js', () => ({ getDriveCredentials, setDriveCredentials }))
vi.mock('../notion/settings.js', () => ({ getNotionToken, setNotionToken }))
vi.mock('../shortcut/settings.js', () => ({ getShortcutToken, setShortcutToken }))
vi.mock('../sentry/settings.js', () => ({ getSentryToken, setSentryToken, getSentryOrg, setSentryOrg }))
vi.mock('../helpjuice/settings.js', () => ({
  getHelpjuiceApiKey,
  setHelpjuiceApiKey,
  getHelpjuiceAccount,
  setHelpjuiceAccount,
}))
vi.mock('../postgres/settings.js', () => ({
  getPostgresConnection,
  setPostgresConnection,
  getPostgresMaxRows,
  setPostgresMaxRows,
  MAX_ROWS_CEILING: 1000,
}))
vi.mock('../shopify/settings.js', () => ({
  getShopifyTokenQuery,
  setShopifyTokenQuery,
  STORE_PLACEHOLDER: '{{store}}',
}))
vi.mock('../shopify/query-drafter.js', () => ({ draftShopifyTokenQuery }))
vi.mock('../slack/settings.js', () => ({
  getSlackBotToken,
  setSlackBotToken,
  getSlackAppToken,
  setSlackAppToken,
  getSlackSigningSecret,
  setSlackSigningSecret,
}))
vi.mock('../slack/bot.js', () => ({ restartSlackBot }))
vi.mock('../github/settings.js', () => ({
  getGithubToken,
  setGithubToken,
  getWebhookSecret,
  setWebhookSecret,
  getRepoCatalog,
  setRepoCatalog,
}))
vi.mock('../openai/settings.js', () => ({
  getOpenAIApiKey,
  setOpenAIApiKey,
  getOpenAIModel,
  setOpenAIModel,
  getVectorStoreId,
  setVectorStoreId,
}))
vi.mock('../db/users.js', () => ({
  countAdmins,
  setAdminCredentials,
  createUserWithPassword,
  listUsers,
  findUserByEmail,
}))

const adminRouter = (await import('./admin.js')).default

const app = express()
app.use(express.json())
app.use('/api/admin', adminRouter)

beforeEach(() => {
  countAdmins.mockReset()
  setAdminCredentials.mockReset()
  createUserWithPassword.mockReset()
  listUsers.mockReset()
  findUserByEmail.mockReset()
  getAllowedDomains.mockReset()
  setAllowedDomains.mockReset()
  hashPassword.mockClear()
  createSession.mockClear()
  verifySetupCode.mockClear()
  verifySetupCode.mockReturnValue(true)
  announceSetupCode.mockClear()
  getAuthMethods.mockReset()
  setAuthMethods.mockReset()
  getGoogleClientId.mockReset()
  setGoogleClientId.mockReset()
  getDriveCredentials.mockReset()
  setDriveCredentials.mockReset()
  getNotionToken.mockReset()
  setNotionToken.mockReset()
  getShortcutToken.mockReset()
  setShortcutToken.mockReset()
  getSentryToken.mockReset()
  setSentryToken.mockReset()
  getSentryOrg.mockReset()
  setSentryOrg.mockReset()
  getHelpjuiceApiKey.mockReset()
  setHelpjuiceApiKey.mockReset()
  getHelpjuiceAccount.mockReset()
  setHelpjuiceAccount.mockReset()
  getPostgresConnection.mockReset()
  setPostgresConnection.mockReset()
  getPostgresMaxRows.mockReset()
  getPostgresMaxRows.mockResolvedValue(100)
  setPostgresMaxRows.mockReset()
  getShopifyTokenQuery.mockReset()
  setShopifyTokenQuery.mockReset()
  draftShopifyTokenQuery.mockReset()
  getSlackBotToken.mockReset()
  setSlackBotToken.mockReset()
  getSlackAppToken.mockReset()
  setSlackAppToken.mockReset()
  getSlackSigningSecret.mockReset()
  setSlackSigningSecret.mockReset()
  restartSlackBot.mockReset()
  restartSlackBot.mockResolvedValue(null)
  getGithubToken.mockReset()
  setGithubToken.mockReset()
  getWebhookSecret.mockReset()
  setWebhookSecret.mockReset()
  getRepoCatalog.mockReset()
  setRepoCatalog.mockReset()
  getOpenAIApiKey.mockReset()
  setOpenAIApiKey.mockReset()
  getOpenAIModel.mockReset()
  setOpenAIModel.mockReset()
  getVectorStoreId.mockReset()
  setVectorStoreId.mockReset()
  clearStatsCache.mockReset()
  currentDbRole = 'admin'
})

describe('GET /api/admin/status', () => {
  it('reports whether an admin exists', async () => {
    countAdmins.mockResolvedValue(0)
    expect((await request(app).get('/api/admin/status')).body).toEqual({ adminExists: false })

    countAdmins.mockResolvedValue(2)
    expect((await request(app).get('/api/admin/status')).body).toEqual({ adminExists: true })
  })
})

describe('POST /api/admin/bootstrap', () => {
  const admin = { id: 1, email: 'boss@x.io', name: 'Boss', picture: null, role: 'admin' }

  it('creates the first admin and returns a session token', async () => {
    countAdmins.mockResolvedValue(0)
    setAdminCredentials.mockResolvedValue(admin)

    const res = await request(app)
      .post('/api/admin/bootstrap')
      .send({ email: 'boss@x.io', password: 'secret-password', name: 'Boss', setupCode: 'valid-code' })

    expect(res.status).toBe(201)
    expect(res.body.token).toBe('session-token')
    expect(res.body.user).toEqual({ email: 'boss@x.io', name: 'Boss', picture: null, role: 'admin' })
    expect(setAdminCredentials).toHaveBeenCalledWith({ email: 'boss@x.io', name: 'Boss', passwordHash: 'hashed' })
    expect(verifySetupCode).toHaveBeenCalledWith('valid-code')
  })

  it('rejects the bootstrap without a valid setup code and re-announces it', async () => {
    countAdmins.mockResolvedValue(0)
    verifySetupCode.mockReturnValue(false)

    const res = await request(app)
      .post('/api/admin/bootstrap')
      .send({ email: 'boss@x.io', password: 'secret-password', setupCode: 'wrong' })

    expect(res.status).toBe(403)
    expect(res.body.error).toContain('setup code')
    expect(announceSetupCode).toHaveBeenCalled()
    expect(setAdminCredentials).not.toHaveBeenCalled()
  })

  it('self-disables once an admin exists', async () => {
    countAdmins.mockResolvedValue(1)

    const res = await request(app)
      .post('/api/admin/bootstrap')
      .send({ email: 'other@x.io', password: 'secret-password' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('An admin account already exists.')
    expect(setAdminCredentials).not.toHaveBeenCalled()
  })

  it('rejects an invalid email and a weak password', async () => {
    countAdmins.mockResolvedValue(0)

    const badEmail = await request(app)
      .post('/api/admin/bootstrap')
      .send({ email: 'nope', password: 'secret-password' })
    expect(badEmail.status).toBe(400)

    const shortPassword = await request(app)
      .post('/api/admin/bootstrap')
      .send({ email: 'boss@x.io', password: 'short' })
    expect(shortPassword.status).toBe(400)
    expect(shortPassword.body.error).toMatch(/at least 8/)
  })

  it('rejects a non-string or oversized name', async () => {
    countAdmins.mockResolvedValue(0)

    const objectName = await request(app)
      .post('/api/admin/bootstrap')
      .send({ email: 'boss@x.io', password: 'secret-password', name: { $ne: null } })
    expect(objectName.status).toBe(400)

    const longName = await request(app)
      .post('/api/admin/bootstrap')
      .send({ email: 'boss@x.io', password: 'secret-password', name: 'n'.repeat(201) })
    expect(longName.status).toBe(400)
    expect(setAdminCredentials).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/users', () => {
  it('returns the user list for an admin', async () => {
    listUsers.mockResolvedValue([{ id: 1, email: 'a@x.io', role: 'admin', hasPassword: true }])

    const res = await request(app).get('/api/admin/users')

    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(1)
  })

  it('rejects non-admins with 403 (DB role check)', async () => {
    currentDbRole = 'user'

    const res = await request(app).get('/api/admin/users')

    expect(res.status).toBe(403)
    expect(listUsers).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users', () => {
  it('creates a password user with the default role', async () => {
    findUserByEmail.mockResolvedValue(null)
    createUserWithPassword.mockResolvedValue({ id: 5, email: 'new@x.io', name: null, role: 'user' })

    const res = await request(app).post('/api/admin/users').send({ email: 'new@x.io', password: 'secret-password' })

    expect(res.status).toBe(201)
    expect(res.body.user).toEqual({ id: 5, email: 'new@x.io', name: null, role: 'user' })
    expect(createUserWithPassword).toHaveBeenCalledWith({
      email: 'new@x.io',
      name: null,
      role: 'user',
      passwordHash: 'hashed',
    })
  })

  it('allows creating another admin', async () => {
    findUserByEmail.mockResolvedValue(null)
    createUserWithPassword.mockResolvedValue({ id: 6, email: 'a2@x.io', name: null, role: 'admin' })

    const res = await request(app)
      .post('/api/admin/users')
      .send({ email: 'a2@x.io', password: 'secret-password', role: 'admin' })

    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('admin')
  })

  it('rejects an invalid role', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .send({ email: 'new@x.io', password: 'secret-password', role: 'superuser' })

    expect(res.status).toBe(400)
  })

  it('rejects a non-string name', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .send({ email: 'new@x.io', password: 'secret-password', name: 42 })

    expect(res.status).toBe(400)
    expect(createUserWithPassword).not.toHaveBeenCalled()
  })

  it('returns 409 when the email already exists', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, email: 'new@x.io' })

    const res = await request(app).post('/api/admin/users').send({ email: 'new@x.io', password: 'secret-password' })

    expect(res.status).toBe(409)
    expect(createUserWithPassword).not.toHaveBeenCalled()
  })

  it('returns 409 when the insert loses a race (unique violation)', async () => {
    findUserByEmail.mockResolvedValue(null)
    createUserWithPassword.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }))

    const res = await request(app).post('/api/admin/users').send({ email: 'new@x.io', password: 'secret-password' })

    expect(res.status).toBe(409)
  })
})

describe('GET /api/admin/config/auth', () => {
  it('returns the sign-in methods, the domain list and the Google client id', async () => {
    getAuthMethods.mockResolvedValue({ google: true, password: false })
    getAllowedDomains.mockResolvedValue(['example.com'])
    getGoogleClientId.mockResolvedValue('abc.apps.googleusercontent.com')

    const res = await request(app).get('/api/admin/config/auth')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      googleEnabled: true,
      passwordEnabled: false,
      domains: ['example.com'],
      googleClientId: 'abc.apps.googleusercontent.com',
    })
  })

  it('returns an empty client id when none is configured', async () => {
    getAuthMethods.mockResolvedValue({ google: false, password: true })
    getAllowedDomains.mockResolvedValue([])
    getGoogleClientId.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/auth')

    expect(res.status).toBe(200)
    expect(res.body.googleClientId).toBe('')
  })
})

describe('PUT /api/admin/config/auth/google-client-id', () => {
  it('saves a trimmed client id', async () => {
    const res = await request(app)
      .put('/api/admin/config/auth/google-client-id')
      .send({ googleClientId: '  abc.apps.googleusercontent.com  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ googleClientId: 'abc.apps.googleusercontent.com' })
    expect(setGoogleClientId).toHaveBeenCalledWith('abc.apps.googleusercontent.com')
  })

  it('accepts an empty string to clear it', async () => {
    const res = await request(app).put('/api/admin/config/auth/google-client-id').send({ googleClientId: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ googleClientId: '' })
    expect(setGoogleClientId).toHaveBeenCalledWith('')
  })

  it('rejects a non-string client id', async () => {
    const res = await request(app).put('/api/admin/config/auth/google-client-id').send({ googleClientId: 123 })

    expect(res.status).toBe(400)
    expect(setGoogleClientId).not.toHaveBeenCalled()
  })

  it('rejects a client id containing whitespace', async () => {
    const res = await request(app)
      .put('/api/admin/config/auth/google-client-id')
      .send({ googleClientId: 'has space.apps.googleusercontent.com' })

    expect(res.status).toBe(400)
    expect(setGoogleClientId).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/google-drive', () => {
  it('reports configured status and the service-account email, never the key', async () => {
    getDriveCredentials.mockResolvedValue({ client_email: 'sa@proj.iam.gserviceaccount.com', private_key: 'SECRET' })

    const res = await request(app).get('/api/admin/config/google-drive')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      credentialsConfigured: true,
      serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com',
    })
    expect(JSON.stringify(res.body)).not.toContain('SECRET')
  })

  it('reports not-configured when there is no credential', async () => {
    getDriveCredentials.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/google-drive')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ credentialsConfigured: false, serviceAccountEmail: '' })
  })
})

describe('PUT /api/admin/config/google-drive/credentials', () => {
  it('saves a credential and returns the service-account email', async () => {
    setDriveCredentials.mockResolvedValue({ client_email: 'sa@proj.iam.gserviceaccount.com', private_key: 'SECRET' })

    const res = await request(app)
      .put('/api/admin/config/google-drive/credentials')
      .send({ credentials: '{"client_email":"sa@proj.iam.gserviceaccount.com","private_key":"SECRET"}' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      credentialsConfigured: true,
      serviceAccountEmail: 'sa@proj.iam.gserviceaccount.com',
    })
  })

  it('accepts an empty string to clear the credential', async () => {
    setDriveCredentials.mockResolvedValue(null)

    const res = await request(app).put('/api/admin/config/google-drive/credentials').send({ credentials: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ credentialsConfigured: false, serviceAccountEmail: '' })
    expect(setDriveCredentials).toHaveBeenCalledWith('')
  })

  it('returns 400 (not 500) when the credential is invalid', async () => {
    setDriveCredentials.mockRejectedValue(
      Object.assign(new Error('The credential is missing "client_email" or "private_key".'), {
        code: 'INVALID_DRIVE_CREDENTIALS',
      })
    )

    const res = await request(app).put('/api/admin/config/google-drive/credentials').send({ credentials: 'garbage' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('client_email')
  })

  it('rejects a non-string credential', async () => {
    const res = await request(app)
      .put('/api/admin/config/google-drive/credentials')
      .send({ credentials: { a: 1 } })

    expect(res.status).toBe(400)
    expect(setDriveCredentials).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/notion', () => {
  it('reports token presence without ever returning the token', async () => {
    getNotionToken.mockResolvedValue('ntn_secret')

    const res = await request(app).get('/api/admin/config/notion')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: true })
    expect(JSON.stringify(res.body)).not.toContain('ntn_secret')
  })

  it('reports an unconfigured token', async () => {
    getNotionToken.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/notion')

    expect(res.body).toEqual({ tokenConfigured: false })
  })
})

describe('PUT /api/admin/config/notion/token', () => {
  it('saves a trimmed token', async () => {
    const res = await request(app).put('/api/admin/config/notion/token').send({ token: '  ntn_new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: true })
    expect(setNotionToken).toHaveBeenCalledWith('ntn_new')
  })

  it('clears the token with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/notion/token').send({ token: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: false })
    expect(setNotionToken).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and token-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/notion/token').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/notion/token').send({ token: 42 })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/notion/token').send({ token: 'has spaces inside' })).status).toBe(
      400
    )
    expect(setNotionToken).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/shortcut', () => {
  it('reports token presence without ever returning the token', async () => {
    getShortcutToken.mockResolvedValue('shortcut-secret')

    const res = await request(app).get('/api/admin/config/shortcut')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: true })
    expect(JSON.stringify(res.body)).not.toContain('shortcut-secret')
  })

  it('reports an unconfigured token', async () => {
    getShortcutToken.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/shortcut')

    expect(res.body).toEqual({ tokenConfigured: false })
  })
})

describe('PUT /api/admin/config/shortcut/token', () => {
  it('saves a trimmed token', async () => {
    const res = await request(app).put('/api/admin/config/shortcut/token').send({ token: '  sc-token-new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: true })
    expect(setShortcutToken).toHaveBeenCalledWith('sc-token-new')
  })

  it('clears the token with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/shortcut/token').send({ token: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: false })
    expect(setShortcutToken).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and token-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/shortcut/token').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/shortcut/token').send({ token: 42 })).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/shortcut/token').send({ token: 'has spaces inside' })).status
    ).toBe(400)
    expect(setShortcutToken).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/helpjuice', () => {
  it('reports API key presence without ever returning it, and returns the account', async () => {
    getHelpjuiceApiKey.mockResolvedValue('hj_secret')
    getHelpjuiceAccount.mockResolvedValue('acme')

    const res = await request(app).get('/api/admin/config/helpjuice')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: true, account: 'acme' })
    expect(JSON.stringify(res.body)).not.toContain('hj_secret')
  })

  it('reports an unconfigured integration', async () => {
    getHelpjuiceApiKey.mockResolvedValue(null)
    getHelpjuiceAccount.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/helpjuice')

    expect(res.body).toEqual({ apiKeyConfigured: false, account: '' })
  })
})

describe('PUT /api/admin/config/helpjuice/api-key', () => {
  it('saves a trimmed API key', async () => {
    const res = await request(app).put('/api/admin/config/helpjuice/api-key').send({ apiKey: '  hj_new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: true })
    expect(setHelpjuiceApiKey).toHaveBeenCalledWith('hj_new')
  })

  it('clears the API key with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/helpjuice/api-key').send({ apiKey: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: false })
    expect(setHelpjuiceApiKey).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and key-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/helpjuice/api-key').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/helpjuice/api-key').send({ apiKey: 42 })).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/helpjuice/api-key').send({ apiKey: 'has spaces inside' })).status
    ).toBe(400)
    expect(setHelpjuiceApiKey).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/helpjuice/account', () => {
  it('saves a trimmed, lowercased account subdomain', async () => {
    const res = await request(app).put('/api/admin/config/helpjuice/account').send({ account: '  Acme  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ account: 'acme' })
    expect(setHelpjuiceAccount).toHaveBeenCalledWith('acme')
  })

  it('clears the account with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/helpjuice/account').send({ account: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ account: '' })
    expect(setHelpjuiceAccount).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and invalid subdomains', async () => {
    expect((await request(app).put('/api/admin/config/helpjuice/account').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/helpjuice/account').send({ account: 42 })).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/helpjuice/account').send({ account: 'not a subdomain' })).status
    ).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/helpjuice/account').send({ account: 'acme.helpjuice.com' })).status
    ).toBe(400)
    expect(setHelpjuiceAccount).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/sentry', () => {
  it('reports auth token presence without ever returning it, and returns the org', async () => {
    getSentryToken.mockResolvedValue('sntrys_secret')
    getSentryOrg.mockResolvedValue('my-org')

    const res = await request(app).get('/api/admin/config/sentry')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: true, org: 'my-org' })
    expect(JSON.stringify(res.body)).not.toContain('sntrys_secret')
  })

  it('reports an unconfigured integration', async () => {
    getSentryToken.mockResolvedValue(null)
    getSentryOrg.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/sentry')

    expect(res.body).toEqual({ tokenConfigured: false, org: '' })
  })
})

describe('PUT /api/admin/config/sentry/auth-token', () => {
  it('saves a trimmed auth token', async () => {
    const res = await request(app).put('/api/admin/config/sentry/auth-token').send({ token: '  sntrys_new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: true })
    expect(setSentryToken).toHaveBeenCalledWith('sntrys_new')
  })

  it('clears the auth token with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/sentry/auth-token').send({ token: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: false })
    expect(setSentryToken).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and token-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/sentry/auth-token').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/sentry/auth-token').send({ token: 42 })).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/sentry/auth-token').send({ token: 'has spaces inside' })).status
    ).toBe(400)
    expect(setSentryToken).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/sentry/org', () => {
  it('saves a trimmed, lowercased org slug', async () => {
    const res = await request(app).put('/api/admin/config/sentry/org').send({ org: '  My-Org  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ org: 'my-org' })
    expect(setSentryOrg).toHaveBeenCalledWith('my-org')
  })

  it('clears the org with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/sentry/org').send({ org: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ org: '' })
    expect(setSentryOrg).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and invalid slugs', async () => {
    expect((await request(app).put('/api/admin/config/sentry/org').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/sentry/org').send({ org: 42 })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/sentry/org').send({ org: 'not a slug' })).status).toBe(400)
    expect(setSentryOrg).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/postgres', () => {
  it('reports connection presence and the row cap without returning the connection string', async () => {
    getPostgresConnection.mockResolvedValue('postgresql://user:secret@host/db')
    getPostgresMaxRows.mockResolvedValue(250)

    const res = await request(app).get('/api/admin/config/postgres')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ connectionConfigured: true, maxRows: 250, maxRowsCeiling: 1000 })
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })

  it('reports an unconfigured connection with the default row cap', async () => {
    getPostgresConnection.mockResolvedValue(null)
    getPostgresMaxRows.mockResolvedValue(100)

    const res = await request(app).get('/api/admin/config/postgres')

    expect(res.body).toEqual({ connectionConfigured: false, maxRows: 100, maxRowsCeiling: 1000 })
  })
})

describe('PUT /api/admin/config/postgres/connection', () => {
  it('saves a trimmed connection string', async () => {
    const res = await request(app)
      .put('/api/admin/config/postgres/connection')
      .send({ connection: '  postgresql://user:pass@host/db  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ connectionConfigured: true })
    expect(setPostgresConnection).toHaveBeenCalledWith('postgresql://user:pass@host/db')
  })

  it('accepts libpq key-value strings with spaces', async () => {
    const res = await request(app)
      .put('/api/admin/config/postgres/connection')
      .send({ connection: 'host=db.example.com dbname=app user=ro password=pw' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ connectionConfigured: true })
    expect(setPostgresConnection).toHaveBeenCalledWith('host=db.example.com dbname=app user=ro password=pw')
  })

  it('clears the connection with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/postgres/connection').send({ connection: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ connectionConfigured: false })
    expect(setPostgresConnection).toHaveBeenCalledWith('')
  })

  it('rejects non-strings, newlines, and absurdly long values', async () => {
    expect((await request(app).put('/api/admin/config/postgres/connection').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/postgres/connection').send({ connection: 42 })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/postgres/connection').send({ connection: 'a\nb' })).status).toBe(
      400
    )
    expect(
      (
        await request(app)
          .put('/api/admin/config/postgres/connection')
          .send({ connection: 'x'.repeat(2001) })
      ).status
    ).toBe(400)
    expect(setPostgresConnection).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/postgres/max-rows', () => {
  it('saves a valid integer and echoes the effective value', async () => {
    getPostgresMaxRows.mockResolvedValue(500)

    const res = await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: 500 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ maxRows: 500 })
    expect(setPostgresMaxRows).toHaveBeenCalledWith(500)
  })

  it('clears (resets to default) with an empty value', async () => {
    getPostgresMaxRows.mockResolvedValue(100)

    const res = await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ maxRows: 100 })
    expect(setPostgresMaxRows).toHaveBeenCalledWith(null)
  })

  it('rejects non-integers and out-of-range values', async () => {
    expect((await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: 0 })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: 5000 })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: 2.5 })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: 'abc' })).status).toBe(400)
    expect(setPostgresMaxRows).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/shopify', () => {
  it('returns the token query (it is SQL, not a secret) and the database status', async () => {
    getShopifyTokenQuery.mockResolvedValue('SELECT domain, token FROM stores WHERE id::text = {{store}}')
    getPostgresConnection.mockResolvedValue('postgresql://user:secret@host/db')

    const res = await request(app).get('/api/admin/config/shopify')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      tokenQueryConfigured: true,
      tokenQuery: 'SELECT domain, token FROM stores WHERE id::text = {{store}}',
      databaseConfigured: true,
    })
  })

  it('reports an unconfigured integration', async () => {
    getShopifyTokenQuery.mockResolvedValue(null)
    getPostgresConnection.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/shopify')

    expect(res.body).toEqual({ tokenQueryConfigured: false, tokenQuery: '', databaseConfigured: false })
  })
})

describe('PUT /api/admin/config/shopify/token-query', () => {
  it('saves a trimmed SELECT with the store placeholder', async () => {
    const res = await request(app)
      .put('/api/admin/config/shopify/token-query')
      .send({ tokenQuery: '  SELECT domain, token FROM stores WHERE id::text = {{store}} LIMIT 1  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenQueryConfigured: true })
    expect(setShopifyTokenQuery).toHaveBeenCalledWith(
      'SELECT domain, token FROM stores WHERE id::text = {{store}} LIMIT 1'
    )
  })

  it('clears the query with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/shopify/token-query').send({ tokenQuery: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenQueryConfigured: false })
    expect(setShopifyTokenQuery).toHaveBeenCalledWith('')
  })

  it('rejects non-strings, non-SELECT statements, and queries without the placeholder', async () => {
    expect((await request(app).put('/api/admin/config/shopify/token-query').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/shopify/token-query').send({ tokenQuery: 42 })).status).toBe(400)
    expect(
      (
        await request(app)
          .put('/api/admin/config/shopify/token-query')
          .send({ tokenQuery: 'DELETE FROM stores WHERE id::text = {{store}}' })
      ).status
    ).toBe(400)
    expect(
      (
        await request(app)
          .put('/api/admin/config/shopify/token-query')
          .send({ tokenQuery: 'SELECT domain, token FROM stores LIMIT 1' })
      ).status
    ).toBe(400)
    expect(
      (
        await request(app)
          .put('/api/admin/config/shopify/token-query')
          .send({ tokenQuery: `SELECT {{store}} ${'x'.repeat(10_001)}` })
      ).status
    ).toBe(400)
    expect(setShopifyTokenQuery).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/config/shopify/draft-token-query', () => {
  it('returns the drafted query without saving anything', async () => {
    getPostgresConnection.mockResolvedValue('postgresql://user:pass@host/db')
    draftShopifyTokenQuery.mockResolvedValue({
      found: true,
      query: 'SELECT domain, token FROM stores WHERE id::text = {{store}} LIMIT 1',
    })

    const res = await request(app).post('/api/admin/config/shopify/draft-token-query')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ query: 'SELECT domain, token FROM stores WHERE id::text = {{store}} LIMIT 1' })
    expect(setShopifyTokenQuery).not.toHaveBeenCalled()
  })

  it('rejects with 409 when the database connection is not configured', async () => {
    getPostgresConnection.mockResolvedValue(null)

    const res = await request(app).post('/api/admin/config/shopify/draft-token-query')

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/Database integration/)
    expect(draftShopifyTokenQuery).not.toHaveBeenCalled()
  })

  it('returns 422 when the assistant finds no credentials', async () => {
    getPostgresConnection.mockResolvedValue('postgresql://user:pass@host/db')
    draftShopifyTokenQuery.mockResolvedValue({ found: false, explanation: 'no token-like columns found.' })

    const res = await request(app).post('/api/admin/config/shopify/draft-token-query')

    expect(res.status).toBe(422)
    expect(res.body.error).toContain('no token-like columns found.')
  })

  it('surfaces drafting errors (e.g. OpenAI not configured)', async () => {
    getPostgresConnection.mockResolvedValue('postgresql://user:pass@host/db')
    draftShopifyTokenQuery.mockRejectedValue(new Error('No OpenAI model configured — set it in /admin.'))

    const res = await request(app).post('/api/admin/config/shopify/draft-token-query')

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('No OpenAI model configured')
  })
})

describe('GET /api/admin/config/slack', () => {
  it('reports each credential presence without ever returning the values', async () => {
    getSlackBotToken.mockResolvedValue('xoxb-secret')
    getSlackAppToken.mockResolvedValue('xapp-secret')
    getSlackSigningSecret.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/slack')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      botTokenConfigured: true,
      appTokenConfigured: true,
      signingSecretConfigured: false,
    })
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })

  it('reports unconfigured credentials', async () => {
    getSlackBotToken.mockResolvedValue(null)
    getSlackAppToken.mockResolvedValue(null)
    getSlackSigningSecret.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/slack')

    expect(res.body).toEqual({
      botTokenConfigured: false,
      appTokenConfigured: false,
      signingSecretConfigured: false,
    })
  })
})

describe('PUT /api/admin/config/slack/bot-token', () => {
  it('saves a trimmed token and reconnects the bot', async () => {
    const res = await request(app).put('/api/admin/config/slack/bot-token').send({ token: '  xoxb-new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ botTokenConfigured: true })
    expect(setSlackBotToken).toHaveBeenCalledWith('xoxb-new')
    expect(restartSlackBot).toHaveBeenCalled()
  })

  it('clears the token with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/slack/bot-token').send({ token: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ botTokenConfigured: false })
    expect(setSlackBotToken).toHaveBeenCalledWith('')
    expect(restartSlackBot).toHaveBeenCalled()
  })

  it('rejects non-strings and token-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/slack/bot-token').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/slack/bot-token').send({ token: 42 })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/slack/bot-token').send({ token: 'has spaces' })).status).toBe(400)
    expect(setSlackBotToken).not.toHaveBeenCalled()
    expect(restartSlackBot).not.toHaveBeenCalled()
  })

  it('still succeeds when the reconnect fails (value already persisted)', async () => {
    restartSlackBot.mockRejectedValue(new Error('socket boom'))

    const res = await request(app).put('/api/admin/config/slack/bot-token').send({ token: 'xoxb-new' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ botTokenConfigured: true })
    expect(setSlackBotToken).toHaveBeenCalledWith('xoxb-new')
  })
})

describe('PUT /api/admin/config/slack/app-token', () => {
  it('saves a trimmed token and reconnects the bot', async () => {
    const res = await request(app).put('/api/admin/config/slack/app-token').send({ token: '  xapp-new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ appTokenConfigured: true })
    expect(setSlackAppToken).toHaveBeenCalledWith('xapp-new')
    expect(restartSlackBot).toHaveBeenCalled()
  })

  it('rejects token-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/slack/app-token').send({ token: 42 })).status).toBe(400)
    expect(setSlackAppToken).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/slack/signing-secret', () => {
  it('saves a trimmed secret and reconnects the bot', async () => {
    const res = await request(app).put('/api/admin/config/slack/signing-secret').send({ secret: '  sign-new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ signingSecretConfigured: true })
    expect(setSlackSigningSecret).toHaveBeenCalledWith('sign-new')
    expect(restartSlackBot).toHaveBeenCalled()
  })

  it('clears the secret with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/slack/signing-secret').send({ secret: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ signingSecretConfigured: false })
    expect(setSlackSigningSecret).toHaveBeenCalledWith('')
  })

  it('rejects non-strings', async () => {
    expect((await request(app).put('/api/admin/config/slack/signing-secret').send({ secret: 42 })).status).toBe(400)
    expect(setSlackSigningSecret).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/auth/methods', () => {
  it('saves the toggles', async () => {
    setAuthMethods.mockResolvedValue({ google: true, password: false })

    const res = await request(app)
      .put('/api/admin/config/auth/methods')
      .send({ googleEnabled: true, passwordEnabled: false })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ googleEnabled: true, passwordEnabled: false })
    expect(setAuthMethods).toHaveBeenCalledWith({ google: true, password: false })
  })

  it('rejects non-boolean toggles', async () => {
    expect((await request(app).put('/api/admin/config/auth/methods').send({ googleEnabled: true })).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/auth/methods').send({ googleEnabled: 'yes', passwordEnabled: true }))
        .status
    ).toBe(400)
    expect(setAuthMethods).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/allowed-domains', () => {
  it('returns the domains', async () => {
    getAllowedDomains.mockResolvedValue(['example.com'])

    const res = await request(app).get('/api/admin/config/allowed-domains')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ domains: ['example.com'] })
  })
})

describe('PUT /api/admin/config/allowed-domains', () => {
  it('normalizes, dedupes and saves the list', async () => {
    setAllowedDomains.mockResolvedValue(['example.com', 'example.org'])

    const res = await request(app)
      .put('/api/admin/config/allowed-domains')
      .send({ domains: [' Example.COM ', 'example.org', 'example.com', ''] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ domains: ['example.com', 'example.org'] })
    expect(setAllowedDomains).toHaveBeenCalledWith(['example.com', 'example.org'])
  })

  it('accepts an empty list (disables Google sign-in)', async () => {
    setAllowedDomains.mockResolvedValue([])

    const res = await request(app).put('/api/admin/config/allowed-domains').send({ domains: [] })

    expect(res.status).toBe(200)
    expect(setAllowedDomains).toHaveBeenCalledWith([])
  })

  it('rejects non-arrays and invalid domains', async () => {
    expect((await request(app).put('/api/admin/config/allowed-domains').send({ domains: 'example.com' })).status).toBe(
      400
    )
    expect(
      (
        await request(app)
          .put('/api/admin/config/allowed-domains')
          .send({ domains: [42] })
      ).status
    ).toBe(400)

    const res = await request(app)
      .put('/api/admin/config/allowed-domains')
      .send({ domains: ['not a domain'] })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('not a domain')
    expect(setAllowedDomains).not.toHaveBeenCalled()
  })

  it('rejects more than 100 domains', async () => {
    const domains = Array.from({ length: 101 }, (_, i) => `d${i}.io`)

    const res = await request(app).put('/api/admin/config/allowed-domains').send({ domains })

    expect(res.status).toBe(400)
    expect(setAllowedDomains).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/github', () => {
  it('reports secret presence without ever returning the secrets', async () => {
    getGithubToken.mockResolvedValue('ghp_secret')
    getWebhookSecret.mockResolvedValue('hook-secret')
    getRepoCatalog.mockResolvedValue('### org/api\nBackend.')

    const res = await request(app).get('/api/admin/config/github')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      tokenConfigured: true,
      webhookSecretConfigured: true,
      repoCatalog: '### org/api\nBackend.',
    })
    expect(JSON.stringify(res.body)).not.toContain('ghp_secret')
    expect(JSON.stringify(res.body)).not.toContain('hook-secret')
  })

  it('reports unconfigured secrets', async () => {
    getGithubToken.mockResolvedValue(null)
    getWebhookSecret.mockResolvedValue(null)
    getRepoCatalog.mockResolvedValue('')

    const res = await request(app).get('/api/admin/config/github')

    expect(res.body).toEqual({ tokenConfigured: false, webhookSecretConfigured: false, repoCatalog: '' })
  })
})

describe('PUT /api/admin/config/github/webhook-secret', () => {
  it('saves a trimmed secret', async () => {
    const res = await request(app).put('/api/admin/config/github/webhook-secret').send({ secret: '  hook-123  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ webhookSecretConfigured: true })
    expect(setWebhookSecret).toHaveBeenCalledWith('hook-123')
  })

  it('clears the secret with an empty string (disables PR reviews)', async () => {
    const res = await request(app).put('/api/admin/config/github/webhook-secret').send({ secret: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ webhookSecretConfigured: false })
    expect(setWebhookSecret).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and oversized secrets', async () => {
    expect((await request(app).put('/api/admin/config/github/webhook-secret').send({})).status).toBe(400)
    expect(
      (
        await request(app)
          .put('/api/admin/config/github/webhook-secret')
          .send({ secret: 'x'.repeat(201) })
      ).status
    ).toBe(400)
    expect(setWebhookSecret).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/github/token', () => {
  it('saves a trimmed token', async () => {
    const res = await request(app).put('/api/admin/config/github/token').send({ token: '  ghp_new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: true })
    expect(setGithubToken).toHaveBeenCalledWith('ghp_new')
  })

  it('clears the token with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/github/token').send({ token: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tokenConfigured: false })
    expect(setGithubToken).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and token-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/github/token').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/github/token').send({ token: 42 })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/github/token').send({ token: 'has spaces inside' })).status).toBe(
      400
    )
    expect(
      (
        await request(app)
          .put('/api/admin/config/github/token')
          .send({ token: 'x'.repeat(201) })
      ).status
    ).toBe(400)
    expect(setGithubToken).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/github/catalog', () => {
  it('saves the catalog text', async () => {
    const res = await request(app).put('/api/admin/config/github/catalog').send({ catalog: '### org/api\nBackend.' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ repoCatalog: '### org/api\nBackend.' })
    expect(setRepoCatalog).toHaveBeenCalledWith('### org/api\nBackend.')
  })

  it('accepts an empty catalog (clears the prompt section)', async () => {
    const res = await request(app).put('/api/admin/config/github/catalog').send({ catalog: '' })

    expect(res.status).toBe(200)
    expect(setRepoCatalog).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and oversized catalogs', async () => {
    expect((await request(app).put('/api/admin/config/github/catalog').send({})).status).toBe(400)
    expect(
      (
        await request(app)
          .put('/api/admin/config/github/catalog')
          .send({ catalog: 'x'.repeat(100_001) })
      ).status
    ).toBe(400)
    expect(setRepoCatalog).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/openai', () => {
  it('reports the model and vector store, never the API key', async () => {
    getOpenAIApiKey.mockResolvedValue('sk-secret')
    getOpenAIModel.mockResolvedValue('gpt-5.2-codex')
    getVectorStoreId.mockResolvedValue('vs_123')

    const res = await request(app).get('/api/admin/config/openai')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: true, model: 'gpt-5.2-codex', vectorStoreId: 'vs_123' })
    expect(JSON.stringify(res.body)).not.toContain('sk-secret')
  })

  it('reports an unconfigured key, model and vector store as empty', async () => {
    getOpenAIApiKey.mockResolvedValue(null)
    getOpenAIModel.mockResolvedValue(null)
    getVectorStoreId.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/openai')

    expect(res.body).toEqual({ apiKeyConfigured: false, model: '', vectorStoreId: '' })
  })
})

describe('PUT /api/admin/config/openai/api-key', () => {
  it('saves a trimmed key', async () => {
    const res = await request(app).put('/api/admin/config/openai/api-key').send({ apiKey: '  sk-new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: true })
    expect(setOpenAIApiKey).toHaveBeenCalledWith('sk-new')
    // The stats cache must be dropped so the solved-cases tile refreshes.
    expect(clearStatsCache).toHaveBeenCalled()
  })

  it('clears the key with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/openai/api-key').send({ apiKey: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: false })
    expect(setOpenAIApiKey).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and key-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/openai/api-key').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/openai/api-key').send({ apiKey: 42 })).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/openai/api-key').send({ apiKey: 'has spaces inside' })).status
    ).toBe(400)
    expect(setOpenAIApiKey).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/openai/model', () => {
  it('saves a trimmed model and echoes it back', async () => {
    const res = await request(app).put('/api/admin/config/openai/model').send({ model: '  gpt-5.2-codex  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ model: 'gpt-5.2-codex' })
    expect(setOpenAIModel).toHaveBeenCalledWith('gpt-5.2-codex')
  })

  it('accepts an empty model (clears it — no default)', async () => {
    const res = await request(app).put('/api/admin/config/openai/model').send({ model: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ model: '' })
    expect(setOpenAIModel).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and model-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/openai/model').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/openai/model').send({ model: 'gpt 4 with spaces' })).status).toBe(
      400
    )
    expect(setOpenAIModel).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/openai/vector-store', () => {
  it('saves a trimmed vector store id', async () => {
    const res = await request(app).put('/api/admin/config/openai/vector-store').send({ vectorStoreId: '  vs_new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ vectorStoreId: 'vs_new' })
    expect(setVectorStoreId).toHaveBeenCalledWith('vs_new')
    // Invalidate the stats cache so "Solved cases learned" reflects the new store.
    expect(clearStatsCache).toHaveBeenCalled()
  })

  it('clears the vector store with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/openai/vector-store').send({ vectorStoreId: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ vectorStoreId: '' })
    expect(setVectorStoreId).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and id-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/openai/vector-store').send({})).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/openai/vector-store').send({ vectorStoreId: 'vs with spaces' })).status
    ).toBe(400)
    expect(setVectorStoreId).not.toHaveBeenCalled()
  })
})
