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

const getLlmProvider = vi.fn()
const setLlmProvider = vi.fn()
const getOpenAIApiKey = vi.fn()
const setOpenAIApiKey = vi.fn()
const getOpenAIModel = vi.fn()
const setOpenAIModel = vi.fn()
const getAnthropicApiKey = vi.fn()
const setAnthropicApiKey = vi.fn()
const getAnthropicModel = vi.fn()
const setAnthropicModel = vi.fn()
const getReasoningEffort = vi.fn()
const setReasoningEffort = vi.fn()
const getKnowledgeOwnApiKey = vi.fn()
const getKnowledgeApiKey = vi.fn()
const setKnowledgeApiKey = vi.fn()
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
const getBetterstackApiToken = vi.fn()
const setBetterstackApiToken = vi.fn()
const getBetterstackConnectHost = vi.fn()
const setBetterstackConnectHost = vi.fn()
const getBetterstackUsername = vi.fn()
const setBetterstackUsername = vi.fn()
const getBetterstackPassword = vi.fn()
const setBetterstackPassword = vi.fn()

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

const listSubagents = vi.fn()
const createSubagent = vi.fn()
const updateSubagent = vi.fn()
const deleteSubagent = vi.fn()
const isShortcutConfigured = vi.fn()
const isSentryConfigured = vi.fn()
const isDriveConfigured = vi.fn()
const isNotionConfigured = vi.fn()
const isHelpjuiceConfigured = vi.fn()
const isPostgresConfigured = vi.fn()
const isBetterstackConfigured = vi.fn()
const isGranolaConfigured = vi.fn()
const isShopifyConfigured = vi.fn()
const INTEGRATION_CHECK_MOCKS = [
  isShortcutConfigured,
  isSentryConfigured,
  isDriveConfigured,
  isNotionConfigured,
  isHelpjuiceConfigured,
  isPostgresConfigured,
  isBetterstackConfigured,
  isGranolaConfigured,
  isShopifyConfigured,
]

vi.mock('./stats.js', () => ({ clearStatsCache, default: {} }))
vi.mock('../auth/setup-code.js', () => ({ verifySetupCode, announceSetupCode }))
vi.mock('../auth/allowed-domains.js', () => ({ getAllowedDomains, setAllowedDomains }))
vi.mock('../auth/auth-methods.js', () => ({ getAuthMethods, setAuthMethods }))
vi.mock('../auth/google-settings.js', () => ({ getGoogleClientId, setGoogleClientId }))
vi.mock('../google-drive/settings.js', () => ({ getDriveCredentials, setDriveCredentials, isDriveConfigured }))
vi.mock('../notion/settings.js', () => ({ getNotionToken, setNotionToken, isNotionConfigured }))
vi.mock('../shortcut/settings.js', () => ({ getShortcutToken, setShortcutToken, isShortcutConfigured }))
vi.mock('../sentry/settings.js', () => ({
  getSentryToken,
  setSentryToken,
  getSentryOrg,
  setSentryOrg,
  isSentryConfigured,
}))
vi.mock('../betterstack/settings.js', () => ({
  getBetterstackApiToken,
  setBetterstackApiToken,
  getBetterstackConnectHost,
  setBetterstackConnectHost,
  getBetterstackUsername,
  setBetterstackUsername,
  getBetterstackPassword,
  setBetterstackPassword,
  isBetterstackConfigured,
}))
vi.mock('../helpjuice/settings.js', () => ({
  getHelpjuiceApiKey,
  setHelpjuiceApiKey,
  getHelpjuiceAccount,
  setHelpjuiceAccount,
  isHelpjuiceConfigured,
}))
vi.mock('../postgres/settings.js', () => ({
  getPostgresConnection,
  setPostgresConnection,
  getPostgresMaxRows,
  setPostgresMaxRows,
  isPostgresConfigured,
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
vi.mock('../llm/settings.js', () => ({
  getLlmProvider,
  setLlmProvider,
  getOpenAIApiKey,
  setOpenAIApiKey,
  getOpenAIModel,
  setOpenAIModel,
  getAnthropicApiKey,
  setAnthropicApiKey,
  getAnthropicModel,
  setAnthropicModel,
  getReasoningEffort,
  setReasoningEffort,
}))
vi.mock('../llm/registry.js', () => ({
  DEFAULT_PROVIDER: 'openai',
  isKnownProvider: id => id === 'openai' || id === 'anthropic',
  listProviders: () => [
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic' },
  ],
}))
vi.mock('../knowledge/settings.js', () => ({
  getOwnApiKey: getKnowledgeOwnApiKey,
  getKnowledgeApiKey,
  setKnowledgeApiKey,
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

vi.mock('../db/subagents.js', () => ({ listSubagents, createSubagent, updateSubagent, deleteSubagent }))

const getMainAgentTools = vi.fn(async () => null)
const setMainAgentTools = vi.fn(async () => {})
vi.mock('../agent/settings.js', () => ({ getMainAgentTools, setMainAgentTools }))
vi.mock('../granola/settings.js', () => ({ isGranolaConfigured }))
vi.mock('../shopify/client.js', () => ({ isConfigured: isShopifyConfigured }))
const REPO_TOOL_NAMES = new Set([
  'list_repos',
  'get_directory_contents',
  'get_file_contents',
  'search_code',
  'find_files',
  'git_log_file',
  'git_blame',
])

vi.mock('../agent/tools.js', async () => {
  const { INTEGRATION_TOOL_NAMES } = await import('../agent/sources.js')

  return {
    REPO_TOOL_NAMES,
    SELECTABLE_TOOL_NAMES: new Set([...REPO_TOOL_NAMES, ...Object.values(INTEGRATION_TOOL_NAMES).flat()]),
  }
})

const adminRouter = (await import('./admin.js')).default

const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  req.user = { id: 7, role: 'admin' }
  next()
})
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
  getBetterstackApiToken.mockReset()
  setBetterstackApiToken.mockReset()
  getBetterstackConnectHost.mockReset()
  setBetterstackConnectHost.mockReset()
  getBetterstackUsername.mockReset()
  setBetterstackUsername.mockReset()
  getBetterstackPassword.mockReset()
  setBetterstackPassword.mockReset()
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
  getLlmProvider.mockReset()
  setLlmProvider.mockReset()
  getOpenAIApiKey.mockReset()
  setOpenAIApiKey.mockReset()
  getOpenAIModel.mockReset()
  setOpenAIModel.mockReset()
  getAnthropicApiKey.mockReset()
  setAnthropicApiKey.mockReset()
  getAnthropicModel.mockReset()
  setAnthropicModel.mockReset()
  getReasoningEffort.mockReset()
  setReasoningEffort.mockReset()
  getKnowledgeOwnApiKey.mockReset()
  getKnowledgeApiKey.mockReset()
  setKnowledgeApiKey.mockReset()
  getVectorStoreId.mockReset()
  setVectorStoreId.mockReset()
  clearStatsCache.mockReset()
  listSubagents.mockReset().mockResolvedValue([])
  createSubagent.mockReset()
  updateSubagent.mockReset()
  deleteSubagent.mockReset()
  for (const check of INTEGRATION_CHECK_MOCKS) check.mockReset().mockResolvedValue(false)
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

describe('GET /api/admin/config/betterstack', () => {
  it('reports secret presence without ever returning the secrets, and returns the host and username', async () => {
    getBetterstackApiToken.mockResolvedValue('bs_token_secret')
    getBetterstackConnectHost.mockResolvedValue('eu-nbg-2-connect.betterstackdata.com')
    getBetterstackUsername.mockResolvedValue('u1234')
    getBetterstackPassword.mockResolvedValue('p4ssw0rd_secret')

    const res = await request(app).get('/api/admin/config/betterstack')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      tokenConfigured: true,
      host: 'eu-nbg-2-connect.betterstackdata.com',
      username: 'u1234',
      passwordConfigured: true,
    })
    expect(JSON.stringify(res.body)).not.toContain('bs_token_secret')
    expect(JSON.stringify(res.body)).not.toContain('p4ssw0rd_secret')
  })

  it('reports an unconfigured integration', async () => {
    getBetterstackApiToken.mockResolvedValue(null)
    getBetterstackConnectHost.mockResolvedValue(null)
    getBetterstackUsername.mockResolvedValue(null)
    getBetterstackPassword.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/betterstack')

    expect(res.body).toEqual({ tokenConfigured: false, host: '', username: '', passwordConfigured: false })
  })
})

describe('PUT /api/admin/config/betterstack/api-token', () => {
  it('saves a trimmed token and clears it with an empty string', async () => {
    const saved = await request(app).put('/api/admin/config/betterstack/api-token').send({ token: '  bs_new  ' })
    expect(saved.status).toBe(200)
    expect(saved.body).toEqual({ tokenConfigured: true })
    expect(setBetterstackApiToken).toHaveBeenCalledWith('bs_new')

    const cleared = await request(app).put('/api/admin/config/betterstack/api-token').send({ token: '' })
    expect(cleared.body).toEqual({ tokenConfigured: false })
    expect(setBetterstackApiToken).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and token-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/betterstack/api-token').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/betterstack/api-token').send({ token: 42 })).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/betterstack/api-token').send({ token: 'has spaces inside' })).status
    ).toBe(400)
    expect(setBetterstackApiToken).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/betterstack/connect-host', () => {
  it('normalizes a pasted host by dropping the scheme and trailing slash', async () => {
    const res = await request(app)
      .put('/api/admin/config/betterstack/connect-host')
      .send({ host: ' https://EU-NBG-2-connect.betterstackdata.com/ ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ host: 'eu-nbg-2-connect.betterstackdata.com' })
    expect(setBetterstackConnectHost).toHaveBeenCalledWith('eu-nbg-2-connect.betterstackdata.com')
  })

  it('keeps an explicit port', async () => {
    const res = await request(app)
      .put('/api/admin/config/betterstack/connect-host')
      .send({ host: 'eu-fsn-3-connect.betterstackdata.com:443' })

    expect(res.body).toEqual({ host: 'eu-fsn-3-connect.betterstackdata.com:443' })
  })

  it('clears the host with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/betterstack/connect-host').send({ host: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ host: '' })
    expect(setBetterstackConnectHost).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and anything that is not a hostname', async () => {
    expect((await request(app).put('/api/admin/config/betterstack/connect-host').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/betterstack/connect-host').send({ host: 42 })).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/betterstack/connect-host').send({ host: 'not a host' })).status
    ).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/betterstack/connect-host').send({ host: 'localhost' })).status
    ).toBe(400)
    expect(setBetterstackConnectHost).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/betterstack/connection-username', () => {
  it('saves a trimmed username and returns it', async () => {
    const res = await request(app)
      .put('/api/admin/config/betterstack/connection-username')
      .send({ username: '  u1234  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ username: 'u1234' })
    expect(setBetterstackUsername).toHaveBeenCalledWith('u1234')
  })

  it('rejects non-strings and usernames with whitespace', async () => {
    expect((await request(app).put('/api/admin/config/betterstack/connection-username').send({})).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/betterstack/connection-username').send({ username: 'u 1234' })).status
    ).toBe(400)
    expect(setBetterstackUsername).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/betterstack/connection-password', () => {
  it('saves the password without returning it and clears it with an empty string', async () => {
    const saved = await request(app)
      .put('/api/admin/config/betterstack/connection-password')
      .send({ password: '  p4ssw0rd  ' })
    expect(saved.status).toBe(200)
    expect(saved.body).toEqual({ passwordConfigured: true })
    expect(JSON.stringify(saved.body)).not.toContain('p4ssw0rd')
    expect(setBetterstackPassword).toHaveBeenCalledWith('p4ssw0rd')

    const cleared = await request(app).put('/api/admin/config/betterstack/connection-password').send({ password: '' })
    expect(cleared.body).toEqual({ passwordConfigured: false })
    expect(setBetterstackPassword).toHaveBeenCalledWith('')
  })

  it('rejects non-strings', async () => {
    expect((await request(app).put('/api/admin/config/betterstack/connection-password').send({})).status).toBe(400)
    expect(setBetterstackPassword).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/postgres', () => {
  it('reports connection presence and the row cap without returning the connection string', async () => {
    getPostgresConnection.mockResolvedValue('postgresql://user:secret@host/db')
    getPostgresMaxRows.mockResolvedValue(250)

    const res = await request(app).get('/api/admin/config/postgres')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ connectionConfigured: true, maxRows: 250 })
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })

  it('reports an unconfigured connection with the default row cap', async () => {
    getPostgresConnection.mockResolvedValue(null)
    getPostgresMaxRows.mockResolvedValue(100)

    const res = await request(app).get('/api/admin/config/postgres')

    expect(res.body).toEqual({ connectionConfigured: false, maxRows: 100 })
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

  it('accepts a large value (no upper bound)', async () => {
    getPostgresMaxRows.mockResolvedValue(5000)

    const res = await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: 5000 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ maxRows: 5000 })
    expect(setPostgresMaxRows).toHaveBeenCalledWith(5000)
  })

  it('rejects non-integers and values below 1', async () => {
    expect((await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: 0 })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/postgres/max-rows').send({ maxRows: -5 })).status).toBe(400)
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

describe('GET /api/admin/config/llm', () => {
  it('reports both providers and their models, never either API key', async () => {
    getLlmProvider.mockResolvedValue('anthropic')
    getOpenAIApiKey.mockResolvedValue('sk-secret')
    getOpenAIModel.mockResolvedValue('gpt-5.2-codex')
    getAnthropicApiKey.mockResolvedValue('sk-ant-secret')
    getAnthropicModel.mockResolvedValue('claude-opus-5')
    getReasoningEffort.mockResolvedValue('low')

    const res = await request(app).get('/api/admin/config/llm')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      provider: 'anthropic',
      providers: [
        { id: 'openai', label: 'OpenAI' },
        { id: 'anthropic', label: 'Anthropic' },
      ],
      openaiApiKeyConfigured: true,
      openaiModel: 'gpt-5.2-codex',
      anthropicApiKeyConfigured: true,
      anthropicModel: 'claude-opus-5',
      reasoningEffort: 'low',
      reasoningEffortLevels: ['low', 'medium', 'high'],
    })
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })

  it('reports unconfigured credentials as empty and falls back to the default provider', async () => {
    getLlmProvider.mockResolvedValue(null)
    getOpenAIApiKey.mockResolvedValue(null)
    getOpenAIModel.mockResolvedValue(null)
    getAnthropicApiKey.mockResolvedValue(null)
    getAnthropicModel.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/llm')

    expect(res.body).toMatchObject({
      provider: 'openai',
      openaiApiKeyConfigured: false,
      openaiModel: '',
      anthropicApiKeyConfigured: false,
      anthropicModel: '',
      reasoningEffort: 'medium',
    })
  })

  it('falls back to the default effort when the stored one is not a supported level', async () => {
    getLlmProvider.mockResolvedValue('anthropic')
    getReasoningEffort.mockResolvedValue('xhigh')

    const res = await request(app).get('/api/admin/config/llm')

    expect(res.body.reasoningEffort).toBe('medium')
  })

  it('falls back to the default provider when the stored id is no longer registered', async () => {
    getLlmProvider.mockResolvedValue('gemini')
    getOpenAIApiKey.mockResolvedValue(null)
    getOpenAIModel.mockResolvedValue(null)
    getAnthropicApiKey.mockResolvedValue(null)
    getAnthropicModel.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/config/llm')

    expect(res.body.provider).toBe('openai')
  })
})

describe('PUT /api/admin/config/llm/provider', () => {
  it('saves a supported provider', async () => {
    const res = await request(app).put('/api/admin/config/llm/provider').send({ provider: 'anthropic' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ provider: 'anthropic' })
    expect(setLlmProvider).toHaveBeenCalledWith('anthropic')
  })

  it('rejects an unsupported provider', async () => {
    expect((await request(app).put('/api/admin/config/llm/provider').send({ provider: 'gemini' })).status).toBe(400)
    expect((await request(app).put('/api/admin/config/llm/provider').send({})).status).toBe(400)
    expect((await request(app).put('/api/admin/config/llm/provider').send({ provider: 42 })).status).toBe(400)
    expect(setLlmProvider).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/llm/reasoning-effort', () => {
  it('saves a supported effort level', async () => {
    const res = await request(app).put('/api/admin/config/llm/reasoning-effort').send({ effort: 'high' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ effort: 'high' })
    expect(setReasoningEffort).toHaveBeenCalledWith('high')
  })

  it('rejects a level neither provider is guaranteed to accept', async () => {
    for (const effort of ['xhigh', 'max', 'minimal', 'none', '', 42, undefined]) {
      const res = await request(app).put('/api/admin/config/llm/reasoning-effort').send({ effort })

      expect(res.status).toBe(400)
    }
    expect(setReasoningEffort).not.toHaveBeenCalled()
  })

  it('returns a 500 without leaking the error when the write fails', async () => {
    setReasoningEffort.mockRejectedValue(new Error('connection refused to db-primary'))

    const res = await request(app).put('/api/admin/config/llm/reasoning-effort').send({ effort: 'low' })

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to save the reasoning effort.' })
  })
})

describe('PUT /api/admin/config/openai/api-key', () => {
  it('saves a trimmed key', async () => {
    const res = await request(app).put('/api/admin/config/openai/api-key').send({ apiKey: '  sk-new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: true })
    expect(setOpenAIApiKey).toHaveBeenCalledWith('sk-new')
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

describe('PUT /api/admin/config/anthropic/api-key', () => {
  it('saves a trimmed key', async () => {
    const res = await request(app).put('/api/admin/config/anthropic/api-key').send({ apiKey: '  sk-ant-new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: true })
    expect(setAnthropicApiKey).toHaveBeenCalledWith('sk-ant-new')
  })

  it('clears the key with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/anthropic/api-key').send({ apiKey: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: false })
    expect(setAnthropicApiKey).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and key-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/anthropic/api-key').send({})).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/anthropic/api-key').send({ apiKey: 'has spaces inside' })).status
    ).toBe(400)
    expect(setAnthropicApiKey).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/config/anthropic/model', () => {
  it('saves a trimmed model and echoes it back', async () => {
    const res = await request(app).put('/api/admin/config/anthropic/model').send({ model: '  claude-opus-5  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ model: 'claude-opus-5' })
    expect(setAnthropicModel).toHaveBeenCalledWith('claude-opus-5')
  })

  it('rejects a model-shaped garbage value', async () => {
    expect(
      (await request(app).put('/api/admin/config/anthropic/model').send({ model: 'claude opus with spaces' })).status
    ).toBe(400)
    expect(setAnthropicModel).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/config/knowledge', () => {
  it('reports the vector store and whether a dedicated key is set, never the key itself', async () => {
    getKnowledgeOwnApiKey.mockResolvedValue('sk-knowledge-secret')
    getKnowledgeApiKey.mockResolvedValue('sk-knowledge-secret')
    getVectorStoreId.mockResolvedValue('vs_123')

    const res = await request(app).get('/api/admin/config/knowledge')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: true, keyAvailable: true, vectorStoreId: 'vs_123' })
    expect(JSON.stringify(res.body)).not.toContain('sk-knowledge-secret')
  })

  it('reports a key is available through the provider key alone', async () => {
    getKnowledgeOwnApiKey.mockResolvedValue(null)
    getKnowledgeApiKey.mockResolvedValue('sk-from-llm-section')
    getVectorStoreId.mockResolvedValue('vs_123')

    const res = await request(app).get('/api/admin/config/knowledge')

    expect(res.body).toEqual({ apiKeyConfigured: false, keyAvailable: true, vectorStoreId: 'vs_123' })
  })

  it('reports no key available when neither a dedicated nor a provider key is set', async () => {
    getKnowledgeOwnApiKey.mockResolvedValue(null)
    getKnowledgeApiKey.mockResolvedValue(null)
    getVectorStoreId.mockResolvedValue('vs_123')

    const res = await request(app).get('/api/admin/config/knowledge')

    expect(res.body).toEqual({ apiKeyConfigured: false, keyAvailable: false, vectorStoreId: 'vs_123' })
  })
})

describe('PUT /api/admin/config/knowledge/api-key', () => {
  it('saves a trimmed key and busts the stats cache', async () => {
    getKnowledgeApiKey.mockResolvedValue('sk-knowledge')

    const res = await request(app).put('/api/admin/config/knowledge/api-key').send({ apiKey: '  sk-knowledge  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: true, keyAvailable: true })
    expect(setKnowledgeApiKey).toHaveBeenCalledWith('sk-knowledge')
    expect(clearStatsCache).toHaveBeenCalled()
  })

  it('clears the key with an empty string so it falls back to the provider key', async () => {
    getKnowledgeApiKey.mockResolvedValue('sk-from-llm-section')

    const res = await request(app).put('/api/admin/config/knowledge/api-key').send({ apiKey: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ apiKeyConfigured: false, keyAvailable: true })
    expect(setKnowledgeApiKey).toHaveBeenCalledWith('')
  })
})

describe('PUT /api/admin/config/knowledge/vector-store', () => {
  it('saves a trimmed vector store id', async () => {
    const res = await request(app).put('/api/admin/config/knowledge/vector-store').send({ vectorStoreId: '  vs_new  ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ vectorStoreId: 'vs_new' })
    expect(setVectorStoreId).toHaveBeenCalledWith('vs_new')
    expect(clearStatsCache).toHaveBeenCalled()
  })

  it('clears the vector store with an empty string', async () => {
    const res = await request(app).put('/api/admin/config/knowledge/vector-store').send({ vectorStoreId: '' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ vectorStoreId: '' })
    expect(setVectorStoreId).toHaveBeenCalledWith('')
  })

  it('rejects non-strings and id-shaped garbage', async () => {
    expect((await request(app).put('/api/admin/config/knowledge/vector-store').send({})).status).toBe(400)
    expect(
      (await request(app).put('/api/admin/config/knowledge/vector-store').send({ vectorStoreId: 'vs with spaces' }))
        .status
    ).toBe(400)
    expect(setVectorStoreId).not.toHaveBeenCalled()
  })
})

const VALID_SUBAGENT = {
  name: 'code_investigator',
  description: 'Owns the codebase and Sentry. Send it a stacktrace to follow or a regression to date.',
  instructions: 'Read the code and report the specific files, lines and commits.',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  tools: ['search_code', 'get_sentry_issue'],
  exclusive: true,
  enabled: true,
}

function enabledRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `specialist_${index}`,
    tools: [],
    exclusive: false,
    enabled: true,
  }))
}

describe('GET /api/admin/subagents', () => {
  it('returns the stored rows, the providers and the global selection in one payload', async () => {
    listSubagents.mockResolvedValue([{ id: 1, name: 'code_investigator', tools: ['search_code'] }])
    getLlmProvider.mockResolvedValue('anthropic')
    getAnthropicModel.mockResolvedValue('claude-opus-5')

    const res = await request(app).get('/api/admin/subagents')

    expect(res.status).toBe(200)
    expect(res.body.subagents).toEqual([{ id: 1, name: 'code_investigator', tools: ['search_code'] }])
    expect(res.body.providers).toEqual([
      { id: 'openai', label: 'OpenAI' },
      { id: 'anthropic', label: 'Anthropic' },
    ])
    expect(res.body.globalProvider).toBe('anthropic')
    expect(res.body.globalModel).toBe('claude-opus-5')
  })

  it('reads the global model of the stored provider, falling back to the default provider', async () => {
    getLlmProvider.mockResolvedValue('gemini')
    getOpenAIModel.mockResolvedValue('gpt-5.2-codex')

    const res = await request(app).get('/api/admin/subagents')

    expect(res.body.globalProvider).toBe('openai')
    expect(res.body.globalModel).toBe('gpt-5.2-codex')
    expect(getAnthropicModel).not.toHaveBeenCalled()
  })

  it('lists the repository tools first and always available', async () => {
    const res = await request(app).get('/api/admin/subagents')

    const [repo] = res.body.tools.groups
    expect(repo).toEqual({
      id: 'repo',
      label: 'Repositories',
      configured: true,
      tools: [
        'list_repos',
        'get_directory_contents',
        'get_file_contents',
        'search_code',
        'find_files',
        'git_log_file',
        'git_blame',
      ],
    })
  })

  it('marks each integration group with whether its credentials are in place', async () => {
    isSentryConfigured.mockResolvedValue(true)
    isNotionConfigured.mockResolvedValue(false)

    const res = await request(app).get('/api/admin/subagents')

    const byId = Object.fromEntries(res.body.tools.groups.map(group => [group.id, group]))
    expect(byId.sentry).toEqual({
      id: 'sentry',
      label: 'Sentry',
      configured: true,
      tools: ['get_sentry_issue', 'search_sentry_issues'],
    })
    expect(byId.notion.configured).toBe(false)
    expect(byId.notion.tools).toEqual(['search_notion_pages', 'get_notion_page'])
  })

  it('resolves the granola check against the requesting admin, whose key it is', async () => {
    await request(app).get('/api/admin/subagents')

    expect(isGranolaConfigured).toHaveBeenCalledWith(7)
  })

  it('returns 500 when the rows cannot be read', async () => {
    listSubagents.mockRejectedValue(new Error('db down'))

    const res = await request(app).get('/api/admin/subagents')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to load the subagents.')
  })
})

describe('POST /api/admin/subagents', () => {
  it('stores the normalized definition and returns it', async () => {
    createSubagent.mockResolvedValue({ id: 3, ...VALID_SUBAGENT })

    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, description: `  ${VALID_SUBAGENT.description}  `, model: ' claude-sonnet-5 ' })

    expect(res.status).toBe(201)
    expect(res.body.subagent).toEqual({ id: 3, ...VALID_SUBAGENT })
    expect(createSubagent).toHaveBeenCalledTimes(1)
    expect(createSubagent).toHaveBeenCalledWith(VALID_SUBAGENT)
  })

  it('defaults a definition that omits the flags to shared and enabled', async () => {
    createSubagent.mockResolvedValue({ id: 3 })

    const res = await request(app).post('/api/admin/subagents').send({
      name: 'log_detective',
      description: 'Owns the logs.',
      instructions: 'Search the logs.',
      provider: null,
      model: null,
      tools: [],
    })

    expect(res.status).toBe(201)
    expect(createSubagent).toHaveBeenCalledWith({
      name: 'log_detective',
      description: 'Owns the logs.',
      instructions: 'Search the logs.',
      provider: null,
      model: null,
      tools: [],
      exclusive: false,
      enabled: true,
    })
  })

  it('drops a tool the caller listed twice', async () => {
    createSubagent.mockResolvedValue({ id: 3 })

    await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, tools: ['search_code', 'search_code', 'get_sentry_issue'] })

    expect(createSubagent).toHaveBeenCalledWith(expect.objectContaining({ tools: ['search_code', 'get_sentry_issue'] }))
  })

  it('rejects a name that is not a lowercase underscore identifier', async () => {
    for (const name of ['Code_Investigator', 'code-investigator', 'a', '1code', '', 42, undefined]) {
      const res = await request(app)
        .post('/api/admin/subagents')
        .send({ ...VALID_SUBAGENT, name })

      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/lowercase letters, numbers and underscores/)
    }
    expect(createSubagent).not.toHaveBeenCalled()
  })

  it('rejects an empty description, because it is the routing signal', async () => {
    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, description: '   ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('A description is required — it is what tells the assistant when to use this subagent.')
  })

  it('rejects a description longer than the cap', async () => {
    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, description: 'x'.repeat(1001) })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Description is too long (max 1000 characters).')
  })

  it('rejects missing instructions', async () => {
    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, instructions: '  ' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Instructions are required.')
  })

  it('rejects a provider that is not registered', async () => {
    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, provider: 'gemini' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('That is not a supported LLM provider.')
  })

  it('rejects a provider without a model', async () => {
    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, model: null })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Pick both a provider and a model, or leave both empty to follow the global selection.')
  })

  it('rejects a model without a provider', async () => {
    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, provider: null })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Pick both a provider and a model, or leave both empty to follow the global selection.')
  })

  it('rejects an empty or oversized model id', async () => {
    for (const model of ['   ', 'x'.repeat(101), 7]) {
      const res = await request(app)
        .post('/api/admin/subagents')
        .send({ ...VALID_SUBAGENT, model })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('A model is required when you pick a provider.')
    }
  })

  it('stores a null provider and model when both are left empty, to follow the global selection', async () => {
    createSubagent.mockResolvedValue({ id: 3 })

    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, provider: null, model: null })

    expect(res.status).toBe(201)
    expect(createSubagent).toHaveBeenCalledWith(expect.objectContaining({ provider: null, model: null }))
  })

  it('rejects a tool the assistant does not have', async () => {
    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, tools: ['search_code', 'rm_minus_rf'] })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('"rm_minus_rf" is not a tool the assistant can grant.')
  })

  it('rejects the artifact tool, which stays with the main agent', async () => {
    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, tools: ['render_artifact'] })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('"render_artifact" is not a tool the assistant can grant.')
  })

  it('rejects a tools value that is not an array, or one over the cap', async () => {
    const notAnArray = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, tools: 'search_code' })
    expect(notAnArray.status).toBe(400)
    expect(notAnArray.body.error).toBe('Tools must be an array of tool names.')

    const tooMany = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, tools: Array.from({ length: 41 }, () => 'search_code') })
    expect(tooMany.status).toBe(400)
    expect(tooMany.body.error).toBe('A subagent can hold at most 40 tools.')
  })

  it('rejects non-boolean flags', async () => {
    const exclusive = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, exclusive: 'yes' })
    expect(exclusive.status).toBe(400)
    expect(exclusive.body.error).toBe('Exclusive must be true or false.')

    const enabled = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, enabled: 'yes' })
    expect(enabled.status).toBe(400)
    expect(enabled.body.error).toBe('Enabled must be true or false.')
  })

  it('refuses to claim a tool another enabled subagent already owns exclusively', async () => {
    listSubagents.mockResolvedValue([
      { id: 1, name: 'context_gatherer', tools: ['get_sentry_issue'], exclusive: true, enabled: true },
    ])

    const res = await request(app).post('/api/admin/subagents').send(VALID_SUBAGENT)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe(
      '"get_sentry_issue" already belongs to the subagent "context_gatherer". A tool can only be taken away from the main agent once.'
    )
    expect(createSubagent).not.toHaveBeenCalled()
  })

  it('lets two subagents share a tool when neither takes it away', async () => {
    listSubagents.mockResolvedValue([
      { id: 1, name: 'context_gatherer', tools: ['search_code'], exclusive: false, enabled: true },
    ])
    createSubagent.mockResolvedValue({ id: 3 })

    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, exclusive: false })

    expect(res.status).toBe(201)
  })

  it('ignores a disabled owner, whose tools are back with the main agent', async () => {
    listSubagents.mockResolvedValue([
      { id: 1, name: 'context_gatherer', tools: ['search_code'], exclusive: true, enabled: false },
    ])
    createSubagent.mockResolvedValue({ id: 3 })

    const res = await request(app).post('/api/admin/subagents').send(VALID_SUBAGENT)

    expect(res.status).toBe(201)
  })

  it('refuses to enable a ninth subagent', async () => {
    listSubagents.mockResolvedValue(enabledRows(8))

    const res = await request(app).post('/api/admin/subagents').send(VALID_SUBAGENT)

    expect(res.status).toBe(422)
    expect(res.body.error).toBe('You can have at most 8 enabled subagents. Disable one first.')
    expect(createSubagent).not.toHaveBeenCalled()
  })

  it('lets a disabled draft past the cap', async () => {
    listSubagents.mockResolvedValue(enabledRows(8))
    createSubagent.mockResolvedValue({ id: 9 })

    const res = await request(app)
      .post('/api/admin/subagents')
      .send({ ...VALID_SUBAGENT, enabled: false })

    expect(res.status).toBe(201)
  })

  it('reports a duplicate name as a conflict', async () => {
    createSubagent.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }))

    const res = await request(app).post('/api/admin/subagents').send(VALID_SUBAGENT)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('A subagent with this name already exists.')
  })

  it('returns a generic 500 when the insert fails for another reason', async () => {
    createSubagent.mockRejectedValue(new Error('db down'))

    const res = await request(app).post('/api/admin/subagents').send(VALID_SUBAGENT)

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to create the subagent.')
  })
})

describe('PUT /api/admin/subagents/:id', () => {
  it('updates the row and returns it', async () => {
    updateSubagent.mockResolvedValue({ id: 4, ...VALID_SUBAGENT })

    const res = await request(app).put('/api/admin/subagents/4').send(VALID_SUBAGENT)

    expect(res.status).toBe(200)
    expect(res.body.subagent).toEqual({ id: 4, ...VALID_SUBAGENT })
    expect(updateSubagent).toHaveBeenCalledWith(4, VALID_SUBAGENT)
  })

  it('rejects an id that is not a number', async () => {
    const res = await request(app).put('/api/admin/subagents/abc').send(VALID_SUBAGENT)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid subagent ID.')
    expect(updateSubagent).not.toHaveBeenCalled()
  })

  it('validates the body before touching the database', async () => {
    const res = await request(app)
      .put('/api/admin/subagents/4')
      .send({ ...VALID_SUBAGENT, name: 'Nope' })

    expect(res.status).toBe(400)
    expect(updateSubagent).not.toHaveBeenCalled()
  })

  it('does not treat the row being edited as a competing owner', async () => {
    listSubagents.mockResolvedValue([
      { id: 4, name: 'code_investigator', tools: ['search_code'], exclusive: true, enabled: true },
    ])
    updateSubagent.mockResolvedValue({ id: 4 })

    const res = await request(app).put('/api/admin/subagents/4').send(VALID_SUBAGENT)

    expect(res.status).toBe(200)
  })

  it('refuses to claim a tool another enabled subagent owns exclusively', async () => {
    listSubagents.mockResolvedValue([
      { id: 1, name: 'context_gatherer', tools: ['search_code'], exclusive: true, enabled: true },
      { id: 4, name: 'code_investigator', tools: [], exclusive: true, enabled: true },
    ])

    const res = await request(app).put('/api/admin/subagents/4').send(VALID_SUBAGENT)

    expect(res.status).toBe(409)
    expect(updateSubagent).not.toHaveBeenCalled()
  })

  it('refuses to enable a row that would be the ninth', async () => {
    listSubagents.mockResolvedValue([...enabledRows(8), { id: 99, name: 'draft', tools: [], enabled: false }])

    const res = await request(app)
      .put('/api/admin/subagents/99')
      .send({ ...VALID_SUBAGENT, exclusive: false })

    expect(res.status).toBe(422)
    expect(updateSubagent).not.toHaveBeenCalled()
  })

  it('lets an already enabled row be saved again at the cap', async () => {
    listSubagents.mockResolvedValue(enabledRows(8))
    updateSubagent.mockResolvedValue({ id: 8 })

    const res = await request(app)
      .put('/api/admin/subagents/8')
      .send({ ...VALID_SUBAGENT, exclusive: false })

    expect(res.status).toBe(200)
  })

  it('returns 404 when no row matches', async () => {
    updateSubagent.mockResolvedValue(null)

    const res = await request(app).put('/api/admin/subagents/99').send(VALID_SUBAGENT)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Subagent not found.')
  })

  it('reports a duplicate name as a conflict', async () => {
    updateSubagent.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }))

    const res = await request(app).put('/api/admin/subagents/4').send(VALID_SUBAGENT)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('A subagent with this name already exists.')
  })

  it('returns a generic 500 when the update fails', async () => {
    updateSubagent.mockRejectedValue(new Error('db down'))

    const res = await request(app).put('/api/admin/subagents/4').send(VALID_SUBAGENT)

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to update the subagent.')
  })
})

describe('DELETE /api/admin/subagents/:id', () => {
  it('deletes the row', async () => {
    deleteSubagent.mockResolvedValue(true)

    const res = await request(app).delete('/api/admin/subagents/4')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deleted: true })
    expect(deleteSubagent).toHaveBeenCalledWith(4)
  })

  it('rejects an id that is not a number', async () => {
    const res = await request(app).delete('/api/admin/subagents/abc')

    expect(res.status).toBe(400)
    expect(deleteSubagent).not.toHaveBeenCalled()
  })

  it('returns 404 when no row matched', async () => {
    deleteSubagent.mockResolvedValue(false)

    const res = await request(app).delete('/api/admin/subagents/99')

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Subagent not found.')
  })

  it('returns a generic 500 when the delete fails', async () => {
    deleteSubagent.mockRejectedValue(new Error('db down'))

    const res = await request(app).delete('/api/admin/subagents/4')

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to delete the subagent.')
  })
})

describe('PUT /api/admin/agent/tools', () => {
  beforeEach(() => {
    getMainAgentTools.mockReset().mockResolvedValue(null)
    setMainAgentTools.mockReset().mockResolvedValue(undefined)
  })

  it('stores the allowlist it was given', async () => {
    const res = await request(app)
      .put('/api/admin/agent/tools')
      .send({ tools: ['search_code', 'get_sentry_issue'] })

    expect(res.status).toBe(200)
    expect(res.body.tools).toEqual(['search_code', 'get_sentry_issue'])
    expect(setMainAgentTools).toHaveBeenCalledWith(['search_code', 'get_sentry_issue'])
  })

  it('clears the allowlist with null so every tool is allowed again', async () => {
    const res = await request(app).put('/api/admin/agent/tools').send({ tools: null })

    expect(res.status).toBe(200)
    expect(res.body.tools).toBeNull()
    expect(setMainAgentTools).toHaveBeenCalledWith(null)
  })

  it('stores an empty allowlist as an empty list', async () => {
    const res = await request(app).put('/api/admin/agent/tools').send({ tools: [] })

    expect(res.status).toBe(200)
    expect(setMainAgentTools).toHaveBeenCalledWith([])
  })

  it('drops a duplicate without complaining', async () => {
    await request(app)
      .put('/api/admin/agent/tools')
      .send({ tools: ['search_code', 'search_code'] })

    expect(setMainAgentTools).toHaveBeenCalledWith(['search_code'])
  })

  it('rejects a tool the assistant does not have', async () => {
    const res = await request(app)
      .put('/api/admin/agent/tools')
      .send({ tools: ['drop_database'] })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('"drop_database" is not a tool the assistant can grant.')
    expect(setMainAgentTools).not.toHaveBeenCalled()
  })

  it('rejects anything that is not a list', async () => {
    const res = await request(app).put('/api/admin/agent/tools').send({ tools: 'search_code' })

    expect(res.status).toBe(400)
    expect(setMainAgentTools).not.toHaveBeenCalled()
  })

  it('returns a generic error when the write fails', async () => {
    setMainAgentTools.mockRejectedValue(new Error('nope'))

    const res = await request(app)
      .put('/api/admin/agent/tools')
      .send({ tools: ['search_code'] })

    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Failed to save the main agent tools.')
  })
})

describe('GET /api/admin/subagents main agent tools', () => {
  it('returns the stored allowlist alongside the subagents', async () => {
    getMainAgentTools.mockResolvedValue(['search_code'])

    const res = await request(app).get('/api/admin/subagents')

    expect(res.status).toBe(200)
    expect(res.body.mainAgentTools).toEqual(['search_code'])
  })

  it('returns null when no allowlist was ever saved', async () => {
    getMainAgentTools.mockResolvedValue(null)

    const res = await request(app).get('/api/admin/subagents')

    expect(res.body.mainAgentTools).toBeNull()
  })
})
