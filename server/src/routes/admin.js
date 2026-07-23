import { Router } from 'express'
import { createSession, requireAdmin } from '../middleware/auth.js'
import { hashPassword, validatePassword } from '../auth/password.js'
import { verifySetupCode, announceSetupCode } from '../auth/setup-code.js'
import { getAllowedDomains, setAllowedDomains } from '../auth/allowed-domains.js'
import { getAuthMethods, setAuthMethods } from '../auth/auth-methods.js'
import { getGoogleClientId, setGoogleClientId } from '../auth/google-settings.js'
import { getDriveCredentials, setDriveCredentials } from '../google-drive/settings.js'
import { getNotionToken, setNotionToken } from '../notion/settings.js'
import { getShortcutToken, setShortcutToken } from '../shortcut/settings.js'
import { getSentryToken, setSentryToken, getSentryOrg, setSentryOrg } from '../sentry/settings.js'
import {
  getHelpjuiceApiKey,
  setHelpjuiceApiKey,
  getHelpjuiceAccount,
  setHelpjuiceAccount,
} from '../helpjuice/settings.js'
import {
  getPostgresConnection,
  setPostgresConnection,
  getPostgresMaxRows,
  setPostgresMaxRows,
} from '../postgres/settings.js'
import { getShopifyTokenQuery, setShopifyTokenQuery, STORE_PLACEHOLDER } from '../shopify/settings.js'
import { draftShopifyTokenQuery } from '../shopify/query-drafter.js'
import {
  getSlackBotToken,
  setSlackBotToken,
  getSlackAppToken,
  setSlackAppToken,
  getSlackSigningSecret,
  setSlackSigningSecret,
} from '../slack/settings.js'
import { restartSlackBot } from '../slack/bot.js'
import {
  getGithubToken,
  setGithubToken,
  getWebhookSecret,
  setWebhookSecret,
  getRepoCatalog,
  setRepoCatalog,
} from '../github/settings.js'
import {
  getOpenAIApiKey,
  setOpenAIApiKey,
  getOpenAIModel,
  setOpenAIModel,
  getVectorStoreId,
  setVectorStoreId,
} from '../openai/settings.js'
import { countAdmins, setAdminCredentials, createUserWithPassword, listUsers, findUserByEmail } from '../db/users.js'
import { clearStatsCache } from './stats.js'

const router = Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Lowercase hostname with at least one dot: "example.com", "sub.example.com".
const DOMAIN_REGEX = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/

function validEmail(email) {
  return typeof email === 'string' && email.trim().length <= 254 && EMAIL_REGEX.test(email.trim())
}

// name is optional; when present it must be a reasonably sized string.
function invalidName(name) {
  return name !== undefined && name !== null && (typeof name !== 'string' || name.length > 200)
}

// --- Public routes (whitelisted in requireAuth) ---------------------------

// GET /api/admin/status — tells the client whether the first-run bootstrap
// form should be shown. Public: it only reveals whether setup has happened.
router.get('/status', async (_req, res) => {
  try {
    res.json({ adminExists: (await countAdmins()) > 0 })
  } catch (err) {
    console.error('Admin status error:', err)
    res.status(500).json({ error: 'Failed to check admin status.' })
  }
})

// POST /api/admin/bootstrap — creates the first admin account. Self-disabling:
// returns 403 as soon as any admin exists, and requires the setup code
// printed in the server logs so only the operator can claim the account.
// The check-then-write race between two concurrent bootstraps is accepted —
// this runs once per install and is strictly rate-limited
// (middleware/security.js).
router.post('/bootstrap', async (req, res) => {
  const { email, password, name, setupCode } = req.body ?? {}

  try {
    if ((await countAdmins()) > 0) {
      return res.status(403).json({ error: 'An admin account already exists.' })
    }

    if (!verifySetupCode(setupCode)) {
      // Make sure the operator can find the code in the logs even if the
      // boot-time announcement was missed (e.g. the DB was down at boot).
      announceSetupCode()
      return res.status(403).json({ error: 'A valid setup code is required. Check the server logs.' })
    }

    if (!validEmail(email)) {
      return res.status(400).json({ error: 'A valid email is required.' })
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      return res.status(400).json({ error: passwordError })
    }
    if (invalidName(name)) {
      return res.status(400).json({ error: 'Name must be a string of at most 200 characters.' })
    }

    const passwordHash = await hashPassword(password)
    // Upserts by email: an operator who signed in with Google before running
    // the bootstrap gets their existing row promoted to admin.
    const user = await setAdminCredentials({ email, name: name || null, passwordHash })
    console.log(`[auth] Admin account created for ${user.email}.`)

    const token = createSession(user)
    res
      .status(201)
      .json({ token, user: { email: user.email, name: user.name, picture: user.picture, role: user.role } })
  } catch (err) {
    console.error('Admin bootstrap error:', err)
    res.status(500).json({ error: 'Failed to create the admin account.' })
  }
})

// --- Admin-only routes -----------------------------------------------------

router.use(requireAdmin)

// GET /api/admin/users — all users with derived auth-method flags.
router.get('/users', async (_req, res) => {
  try {
    res.json({ users: await listUsers() })
  } catch (err) {
    console.error('Admin list users error:', err)
    res.status(500).json({ error: 'Failed to list users.' })
  }
})

// POST /api/admin/users — creates a password user (no self-registration).
// Admins may create other admins; there is no role-edit endpoint yet.
router.post('/users', async (req, res) => {
  const { email, password, name, role } = req.body ?? {}

  if (!validEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required.' })
  }
  const passwordError = validatePassword(password)
  if (passwordError) {
    return res.status(400).json({ error: passwordError })
  }
  if (role !== undefined && role !== 'user' && role !== 'admin') {
    return res.status(400).json({ error: 'Role must be "user" or "admin".' })
  }
  if (invalidName(name)) {
    return res.status(400).json({ error: 'Name must be a string of at most 200 characters.' })
  }

  try {
    // Strict conflict: an admin must not silently overwrite someone's
    // credentials. Linking a password to an existing Google/Slack row is a
    // deliberate future feature, not a side effect of this form.
    if (await findUserByEmail(email)) {
      return res.status(409).json({ error: 'A user with this email already exists.' })
    }

    const passwordHash = await hashPassword(password)
    const user = await createUserWithPassword({ email, name: name || null, role: role ?? 'user', passwordHash })
    res.status(201).json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists.' })
    }
    console.error('Admin create user error:', err)
    res.status(500).json({ error: 'Failed to create the user.' })
  }
})

// GET /api/admin/config/auth — sign-in methods and Google domain restriction
// in one read (the Authentication section of the panel).
router.get('/config/auth', async (_req, res) => {
  try {
    const [methods, domains, googleClientId] = await Promise.all([
      getAuthMethods(),
      getAllowedDomains(),
      getGoogleClientId(),
    ])
    res.json({
      googleEnabled: methods.google,
      passwordEnabled: methods.password,
      domains,
      // Not a secret (it's also the public VITE_GOOGLE_CLIENT_ID), so the actual
      // value is returned to prefill the editable field.
      googleClientId: googleClientId ?? '',
    })
  } catch (err) {
    console.error('Admin get auth config error:', err)
    res.status(500).json({ error: 'Failed to read the authentication settings.' })
  }
})

// PUT /api/admin/config/auth/methods — toggles the sign-in methods. Password
// login always keeps working for admins regardless of the toggle (anti
// lockout), so any combination is safe to store.
router.put('/config/auth/methods', async (req, res) => {
  const { googleEnabled, passwordEnabled } = req.body ?? {}

  if (typeof googleEnabled !== 'boolean' || typeof passwordEnabled !== 'boolean') {
    return res.status(400).json({ error: '"googleEnabled" and "passwordEnabled" must be booleans.' })
  }

  try {
    const methods = await setAuthMethods({ google: googleEnabled, password: passwordEnabled })
    res.json({ googleEnabled: methods.google, passwordEnabled: methods.password })
  } catch (err) {
    console.error('Admin set auth methods error:', err)
    res.status(500).json({ error: 'Failed to save the sign-in methods.' })
  }
})

// GET /api/admin/config/allowed-domains — current Google sign-in domains.
router.get('/config/allowed-domains', async (_req, res) => {
  try {
    res.json({ domains: await getAllowedDomains() })
  } catch (err) {
    console.error('Admin get allowed domains error:', err)
    res.status(500).json({ error: 'Failed to read allowed domains.' })
  }
})

// PUT /api/admin/config/allowed-domains — replaces the list. An empty array
// is valid and disables Google sign-in entirely (fail closed).
router.put('/config/allowed-domains', async (req, res) => {
  const { domains } = req.body ?? {}

  if (!Array.isArray(domains) || domains.some(domain => typeof domain !== 'string')) {
    return res.status(400).json({ error: '"domains" must be an array of strings.' })
  }
  if (domains.length > 100) {
    return res.status(400).json({ error: 'At most 100 domains are allowed.' })
  }

  const normalized = [...new Set(domains.map(domain => domain.trim().toLowerCase()).filter(Boolean))]
  const invalid = normalized.filter(domain => domain.length > 253 || !DOMAIN_REGEX.test(domain))
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Invalid domains: ${invalid.join(', ')}` })
  }

  try {
    res.json({ domains: await setAllowedDomains(normalized) })
  } catch (err) {
    console.error('Admin set allowed domains error:', err)
    res.status(500).json({ error: 'Failed to save allowed domains.' })
  }
})

// PUT /api/admin/config/auth/google-client-id — sets (or clears, with an empty
// string) the Google Sign-In client id used to verify Google ID tokens. Must
// match the VITE_GOOGLE_CLIENT_ID baked into the frontend build.
router.put('/config/auth/google-client-id', async (req, res) => {
  const { googleClientId } = req.body ?? {}

  if (typeof googleClientId !== 'string') {
    return res.status(400).json({ error: '"googleClientId" must be a string (empty to clear it).' })
  }
  const trimmed = googleClientId.trim()
  if (trimmed.length > 0 && (trimmed.length > 200 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid Google client id.' })
  }

  try {
    await setGoogleClientId(trimmed)
    res.json({ googleClientId: trimmed })
  } catch (err) {
    console.error('Admin set google client id error:', err)
    res.status(500).json({ error: 'Failed to save the Google client id.' })
  }
})

// GET /api/admin/config/github — GitHub settings. Secrets (token and webhook
// secret) are never returned (write-only), only whether they are configured.
router.get('/config/github', async (_req, res) => {
  try {
    const [token, webhookSecret, repoCatalog] = await Promise.all([
      getGithubToken(),
      getWebhookSecret(),
      getRepoCatalog(),
    ])
    res.json({
      tokenConfigured: Boolean(token),
      webhookSecretConfigured: Boolean(webhookSecret),
      repoCatalog,
    })
  } catch (err) {
    console.error('Admin get github config error:', err)
    res.status(500).json({ error: 'Failed to read the GitHub settings.' })
  }
})

// PUT /api/admin/config/github/token — sets (or clears, with an empty string)
// the GitHub token used by every GitHub feature (repo tools, clones, reviews).
router.put('/config/github/token', async (req, res) => {
  const { token } = req.body ?? {}

  if (typeof token !== 'string') {
    return res.status(400).json({ error: '"token" must be a string (empty to clear it).' })
  }
  const trimmed = token.trim()
  if (trimmed.length > 0 && (trimmed.length > 200 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid GitHub token.' })
  }

  try {
    await setGithubToken(trimmed)
    res.json({ tokenConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set github token error:', err)
    res.status(500).json({ error: 'Failed to save the GitHub token.' })
  }
})

// PUT /api/admin/config/github/webhook-secret — sets (or clears, with an
// empty string) the shared secret for the PR-review webhook. It must match
// the secret configured in the GitHub org webhook; effective immediately.
router.put('/config/github/webhook-secret', async (req, res) => {
  const { secret } = req.body ?? {}

  if (typeof secret !== 'string') {
    return res.status(400).json({ error: '"secret" must be a string (empty to clear it).' })
  }
  const trimmed = secret.trim()
  if (trimmed.length > 200) {
    return res.status(400).json({ error: 'The webhook secret must be at most 200 characters.' })
  }

  try {
    await setWebhookSecret(trimmed)
    res.json({ webhookSecretConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set webhook secret error:', err)
    res.status(500).json({ error: 'Failed to save the webhook secret.' })
  }
})

// PUT /api/admin/config/github/catalog — free text injected into the agent
// prompt describing what each repo covers. Empty clears the section.
router.put('/config/github/catalog', async (req, res) => {
  const { catalog } = req.body ?? {}

  if (typeof catalog !== 'string') {
    return res.status(400).json({ error: '"catalog" must be a string.' })
  }
  if (catalog.length > 100_000) {
    return res.status(400).json({ error: 'The catalog must be at most 100,000 characters.' })
  }

  try {
    await setRepoCatalog(catalog)
    res.json({ repoCatalog: catalog })
  } catch (err) {
    console.error('Admin set repo catalog error:', err)
    res.status(500).json({ error: 'Failed to save the repository catalog.' })
  }
})

// GET /api/admin/config/openai — OpenAI settings. The API key is never returned
// (write-only), only whether it is configured; the model and vector store id
// are shown so the admin can see the current values.
router.get('/config/openai', async (_req, res) => {
  try {
    const [apiKey, model, vectorStoreId] = await Promise.all([getOpenAIApiKey(), getOpenAIModel(), getVectorStoreId()])
    res.json({ apiKeyConfigured: Boolean(apiKey), model: model ?? '', vectorStoreId: vectorStoreId ?? '' })
  } catch (err) {
    console.error('Admin get openai config error:', err)
    res.status(500).json({ error: 'Failed to read the OpenAI settings.' })
  }
})

// PUT /api/admin/config/openai/api-key — sets (or clears, with an empty string)
// the OpenAI API key used by the assistant, agents and the knowledge base.
router.put('/config/openai/api-key', async (req, res) => {
  const { apiKey } = req.body ?? {}

  if (typeof apiKey !== 'string') {
    return res.status(400).json({ error: '"apiKey" must be a string (empty to clear it).' })
  }
  const trimmed = apiKey.trim()
  if (trimmed.length > 0 && (trimmed.length > 300 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid OpenAI API key.' })
  }

  try {
    await setOpenAIApiKey(trimmed)
    // The knowledge base (solved-cases count) needs the API key, so a stale
    // stats cache would keep hiding the tile after configuring it.
    clearStatsCache()
    res.json({ apiKeyConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set openai api key error:', err)
    res.status(500).json({ error: 'Failed to save the OpenAI API key.' })
  }
})

// PUT /api/admin/config/openai/model — sets (or clears, with an empty string)
// the model. There is no default: an empty model disables the assistant until
// one is set, just like clearing the API key.
router.put('/config/openai/model', async (req, res) => {
  const { model } = req.body ?? {}

  if (typeof model !== 'string') {
    return res.status(400).json({ error: '"model" must be a string (empty to clear it).' })
  }
  const trimmed = model.trim()
  if (trimmed.length > 0 && (trimmed.length > 100 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid model id.' })
  }

  try {
    await setOpenAIModel(trimmed)
    res.json({ model: trimmed })
  } catch (err) {
    console.error('Admin set openai model error:', err)
    res.status(500).json({ error: 'Failed to save the model.' })
  }
})

// PUT /api/admin/config/openai/vector-store — sets (or clears, with an empty
// string) the vector store id used by the knowledge base (similar cases).
router.put('/config/openai/vector-store', async (req, res) => {
  const { vectorStoreId } = req.body ?? {}

  if (typeof vectorStoreId !== 'string') {
    return res.status(400).json({ error: '"vectorStoreId" must be a string (empty to clear it).' })
  }
  const trimmed = vectorStoreId.trim()
  if (trimmed.length > 0 && (trimmed.length > 200 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid vector store id.' })
  }

  try {
    await setVectorStoreId(trimmed)
    // Invalidate the cached stats so the "Solved cases learned" tile reflects
    // the newly configured vector store on the next request instead of waiting
    // out the 5-minute TTL.
    clearStatsCache()
    res.json({ vectorStoreId: trimmed })
  } catch (err) {
    console.error('Admin set openai vector store error:', err)
    res.status(500).json({ error: 'Failed to save the vector store id.' })
  }
})

// GET /api/admin/config/google-drive — Google Drive integration status. The
// credential is write-only (the private key is never returned); the
// non-sensitive service-account email is returned so an admin can verify which
// account is live and therefore what shared folders are exposed.
router.get('/config/google-drive', async (_req, res) => {
  try {
    const creds = await getDriveCredentials()
    res.json({
      credentialsConfigured: Boolean(creds),
      serviceAccountEmail: creds?.client_email ?? '',
    })
  } catch (err) {
    console.error('Admin get google drive config error:', err)
    res.status(500).json({ error: 'Failed to read the Google Drive settings.' })
  }
})

// PUT /api/admin/config/google-drive/credentials — sets (or clears, with an
// empty string) the service-account credential. Accepts the raw JSON key or its
// base64 blob; a parse/validation failure is a 400 that never echoes the
// credential material back.
router.put('/config/google-drive/credentials', async (req, res) => {
  const { credentials } = req.body ?? {}

  if (typeof credentials !== 'string') {
    return res.status(400).json({ error: '"credentials" must be a string (empty to clear it).' })
  }
  if (credentials.length > 200_000) {
    return res.status(400).json({ error: 'The credential is too large.' })
  }

  try {
    const creds = await setDriveCredentials(credentials)
    res.json({
      credentialsConfigured: Boolean(creds),
      serviceAccountEmail: creds?.client_email ?? '',
    })
  } catch (err) {
    if (err.code === 'INVALID_DRIVE_CREDENTIALS') {
      return res.status(400).json({ error: err.message })
    }
    console.error('Admin set google drive credentials error:', err)
    res.status(500).json({ error: 'Failed to save the Google Drive credentials.' })
  }
})

// GET /api/admin/config/notion — Notion integration status. The token is
// write-only (never returned), only whether it is configured.
router.get('/config/notion', async (_req, res) => {
  try {
    const token = await getNotionToken()
    res.json({ tokenConfigured: Boolean(token) })
  } catch (err) {
    console.error('Admin get notion config error:', err)
    res.status(500).json({ error: 'Failed to read the Notion settings.' })
  }
})

// PUT /api/admin/config/notion/token — sets (or clears, with an empty string)
// the Notion integration token used to search and read Notion pages.
router.put('/config/notion/token', async (req, res) => {
  const { token } = req.body ?? {}

  if (typeof token !== 'string') {
    return res.status(400).json({ error: '"token" must be a string (empty to clear it).' })
  }
  const trimmed = token.trim()
  if (trimmed.length > 0 && (trimmed.length > 200 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid Notion token.' })
  }

  try {
    await setNotionToken(trimmed)
    res.json({ tokenConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set notion token error:', err)
    res.status(500).json({ error: 'Failed to save the Notion token.' })
  }
})

// GET /api/admin/config/shortcut — Shortcut integration status. The token is
// write-only (never returned), only whether it is configured.
router.get('/config/shortcut', async (_req, res) => {
  try {
    const token = await getShortcutToken()
    res.json({ tokenConfigured: Boolean(token) })
  } catch (err) {
    console.error('Admin get shortcut config error:', err)
    res.status(500).json({ error: 'Failed to read the Shortcut settings.' })
  }
})

// PUT /api/admin/config/shortcut/token — sets (or clears, with an empty
// string) the Shortcut API token used to look up stories.
router.put('/config/shortcut/token', async (req, res) => {
  const { token } = req.body ?? {}

  if (typeof token !== 'string') {
    return res.status(400).json({ error: '"token" must be a string (empty to clear it).' })
  }
  const trimmed = token.trim()
  if (trimmed.length > 0 && (trimmed.length > 200 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid Shortcut token.' })
  }

  try {
    await setShortcutToken(trimmed)
    res.json({ tokenConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set shortcut token error:', err)
    res.status(500).json({ error: 'Failed to save the Shortcut token.' })
  }
})

// GET /api/admin/config/helpjuice — Helpjuice integration status. The API key
// is write-only (never returned), only whether it is configured. The account
// subdomain is not a secret, so its value is returned.
router.get('/config/helpjuice', async (_req, res) => {
  try {
    const [apiKey, account] = await Promise.all([getHelpjuiceApiKey(), getHelpjuiceAccount()])
    res.json({ apiKeyConfigured: Boolean(apiKey), account: account ?? '' })
  } catch (err) {
    console.error('Admin get helpjuice config error:', err)
    res.status(500).json({ error: 'Failed to read the Helpjuice settings.' })
  }
})

// PUT /api/admin/config/helpjuice/api-key — sets (or clears, with an empty
// string) the Helpjuice API key used to search and read help center articles.
router.put('/config/helpjuice/api-key', async (req, res) => {
  const { apiKey } = req.body ?? {}

  if (typeof apiKey !== 'string') {
    return res.status(400).json({ error: '"apiKey" must be a string (empty to clear it).' })
  }
  const trimmed = apiKey.trim()
  if (trimmed.length > 0 && (trimmed.length > 200 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid Helpjuice API key.' })
  }

  try {
    await setHelpjuiceApiKey(trimmed)
    res.json({ apiKeyConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set helpjuice api key error:', err)
    res.status(500).json({ error: 'Failed to save the Helpjuice API key.' })
  }
})

// PUT /api/admin/config/helpjuice/account — sets (or clears, with an empty
// string) the Helpjuice account subdomain (the "example" in example.helpjuice.com).
router.put('/config/helpjuice/account', async (req, res) => {
  const { account } = req.body ?? {}

  if (typeof account !== 'string') {
    return res.status(400).json({ error: '"account" must be a string (empty to clear it).' })
  }
  const trimmed = account.trim().toLowerCase()
  if (trimmed.length > 0 && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(trimmed)) {
    return res
      .status(400)
      .json({ error: 'That does not look like a valid Helpjuice account subdomain (e.g. "example").' })
  }

  try {
    await setHelpjuiceAccount(trimmed)
    res.json({ account: trimmed })
  } catch (err) {
    console.error('Admin set helpjuice account error:', err)
    res.status(500).json({ error: 'Failed to save the Helpjuice account.' })
  }
})

// GET /api/admin/config/sentry — Sentry integration status. The auth token is
// write-only (never returned), only whether it is configured. The organization
// slug is not a secret, so its value is returned.
router.get('/config/sentry', async (_req, res) => {
  try {
    const [token, org] = await Promise.all([getSentryToken(), getSentryOrg()])
    res.json({ tokenConfigured: Boolean(token), org: org ?? '' })
  } catch (err) {
    console.error('Admin get sentry config error:', err)
    res.status(500).json({ error: 'Failed to read the Sentry settings.' })
  }
})

// PUT /api/admin/config/sentry/auth-token — sets (or clears, with an empty
// string) the Sentry auth token used to search and inspect issues.
router.put('/config/sentry/auth-token', async (req, res) => {
  const { token } = req.body ?? {}

  if (typeof token !== 'string') {
    return res.status(400).json({ error: '"token" must be a string (empty to clear it).' })
  }
  const trimmed = token.trim()
  if (trimmed.length > 0 && (trimmed.length > 300 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid Sentry auth token.' })
  }

  try {
    await setSentryToken(trimmed)
    res.json({ tokenConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set sentry auth token error:', err)
    res.status(500).json({ error: 'Failed to save the Sentry auth token.' })
  }
})

// PUT /api/admin/config/sentry/org — sets (or clears, with an empty string) the
// Sentry organization slug (the "org" in sentry.io/organizations/org/).
router.put('/config/sentry/org', async (req, res) => {
  const { org } = req.body ?? {}

  if (typeof org !== 'string') {
    return res.status(400).json({ error: '"org" must be a string (empty to clear it).' })
  }
  const trimmed = org.trim().toLowerCase()
  if (trimmed.length > 0 && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(trimmed)) {
    return res.status(400).json({ error: 'That does not look like a valid Sentry organization slug (e.g. "my-org").' })
  }

  try {
    await setSentryOrg(trimmed)
    res.json({ org: trimmed })
  } catch (err) {
    console.error('Admin set sentry org error:', err)
    res.status(500).json({ error: 'Failed to save the Sentry organization.' })
  }
})

// GET /api/admin/config/postgres — status of the agent's read-only PostgreSQL
// query tool. The connection string carries a password, so it is write-only
// (never returned), only whether it is configured. The row cap is not a secret,
// so the effective value is returned. This is NOT the app database
// (DATABASE_URL); it is the customer database the agent explores.
router.get('/config/postgres', async (_req, res) => {
  try {
    const [connection, maxRows] = await Promise.all([getPostgresConnection(), getPostgresMaxRows()])
    res.json({ connectionConfigured: Boolean(connection), maxRows })
  } catch (err) {
    console.error('Admin get postgres config error:', err)
    res.status(500).json({ error: 'Failed to read the database settings.' })
  }
})

// PUT /api/admin/config/postgres/connection — sets (or clears, with an empty
// string) the read-only connection string used by the agent's query tool.
router.put('/config/postgres/connection', async (req, res) => {
  const { connection } = req.body ?? {}

  if (typeof connection !== 'string') {
    return res.status(400).json({ error: '"connection" must be a string (empty to clear it).' })
  }
  const trimmed = connection.trim()
  // Accept both URL (postgres://...) and libpq key-value forms, so allow
  // spaces; only reject newlines and absurd lengths.
  if (trimmed.length > 0 && (trimmed.length > 2000 || /[\r\n]/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid PostgreSQL connection string.' })
  }

  try {
    await setPostgresConnection(trimmed)
    res.json({ connectionConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set postgres connection error:', err)
    res.status(500).json({ error: 'Failed to save the database connection string.' })
  }
})

// PUT /api/admin/config/postgres/max-rows — sets the cap on rows returned by
// the agent's query tool. An empty value resets it to the default. The value
// must be an integer >= 1; there is no upper bound.
router.put('/config/postgres/max-rows', async (req, res) => {
  const { maxRows } = req.body ?? {}

  // Empty string / null clears it (reverts to the default).
  if (maxRows === '' || maxRows === null || maxRows === undefined) {
    try {
      await setPostgresMaxRows(null)
      return res.json({ maxRows: await getPostgresMaxRows() })
    } catch (err) {
      console.error('Admin clear postgres max-rows error:', err)
      return res.status(500).json({ error: 'Failed to save the row limit.' })
    }
  }

  const n = Number(maxRows)
  if (!Number.isInteger(n) || n < 1) {
    return res.status(400).json({ error: '"maxRows" must be an integer greater than or equal to 1.' })
  }

  try {
    await setPostgresMaxRows(n)
    res.json({ maxRows: await getPostgresMaxRows() })
  } catch (err) {
    console.error('Admin set postgres max-rows error:', err)
    res.status(500).json({ error: 'Failed to save the row limit.' })
  }
})

// GET /api/admin/config/shopify — Shopify integration settings. The store
// token query is SQL, not a credential, so its value is returned for editing.
// The integration is active only when both this query and the Database
// connection are configured.
router.get('/config/shopify', async (_req, res) => {
  try {
    const [tokenQuery, postgresConnection] = await Promise.all([getShopifyTokenQuery(), getPostgresConnection()])
    res.json({
      tokenQueryConfigured: Boolean(tokenQuery),
      tokenQuery: tokenQuery ?? '',
      databaseConfigured: Boolean(postgresConnection),
    })
  } catch (err) {
    console.error('Admin get shopify config error:', err)
    res.status(500).json({ error: 'Failed to read the Shopify settings.' })
  }
})

// PUT /api/admin/config/shopify/token-query — sets (or clears, with an empty
// string) the SQL template that resolves a store identifier to its Shopify
// domain and Admin API token in the read-only database.
router.put('/config/shopify/token-query', async (req, res) => {
  const { tokenQuery } = req.body ?? {}

  if (typeof tokenQuery !== 'string') {
    return res.status(400).json({ error: '"tokenQuery" must be a string (empty to clear it).' })
  }
  const trimmed = tokenQuery.trim()
  if (trimmed.length > 10_000) {
    return res.status(400).json({ error: 'The token query is too long (max 10000 characters).' })
  }
  if (trimmed.length > 0 && !/^(select|with)\b/i.test(trimmed)) {
    return res.status(400).json({ error: 'The token query must be a read-only SELECT (or WITH) statement.' })
  }
  if (trimmed.length > 0 && !trimmed.includes(STORE_PLACEHOLDER)) {
    return res.status(400).json({ error: `The token query must contain the ${STORE_PLACEHOLDER} placeholder.` })
  }

  try {
    await setShopifyTokenQuery(trimmed)
    res.json({ tokenQueryConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set shopify token query error:', err)
    res.status(500).json({ error: 'Failed to save the Shopify token query.' })
  }
})

// POST /api/admin/config/shopify/draft-token-query — lets the assistant
// explore the connected read-only database (schema tools only, so it never
// sees token values) and draft the store token query. Returns the SQL for the
// admin to review in the editor; nothing is saved here.
router.post('/config/shopify/draft-token-query', async (_req, res) => {
  try {
    if (!(await getPostgresConnection())) {
      return res.status(409).json({
        error: 'Configure the Database integration first — the assistant needs it to explore the schema.',
      })
    }

    const draft = await draftShopifyTokenQuery()
    if (!draft.found) {
      return res
        .status(422)
        .json({ error: `The assistant could not find Shopify credentials in the database: ${draft.explanation}` })
    }
    res.json({ query: draft.query })
  } catch (err) {
    console.error('Admin draft shopify token query error:', err)
    res.status(500).json({ error: err.message || 'Failed to draft the token query.' })
  }
})

// Reconnect the Slack bot after a credential change. A connection failure is
// logged but never fails the request — the value is already persisted, and the
// bot will pick it up on the next restart regardless.
async function reconnectSlack() {
  try {
    await restartSlackBot()
  } catch (err) {
    console.error('Admin slack reconnect error:', err.message)
  }
}

// GET /api/admin/config/slack — Slack bot status. The three credentials are
// write-only (never returned), only whether each is configured.
router.get('/config/slack', async (_req, res) => {
  try {
    const [botToken, appToken, signingSecret] = await Promise.all([
      getSlackBotToken(),
      getSlackAppToken(),
      getSlackSigningSecret(),
    ])
    res.json({
      botTokenConfigured: Boolean(botToken),
      appTokenConfigured: Boolean(appToken),
      signingSecretConfigured: Boolean(signingSecret),
    })
  } catch (err) {
    console.error('Admin get slack config error:', err)
    res.status(500).json({ error: 'Failed to read the Slack settings.' })
  }
})

// PUT /api/admin/config/slack/bot-token — sets (or clears, with an empty
// string) the bot (xoxb-) token. The bot reconnects immediately.
router.put('/config/slack/bot-token', async (req, res) => {
  const { token } = req.body ?? {}

  if (typeof token !== 'string') {
    return res.status(400).json({ error: '"token" must be a string (empty to clear it).' })
  }
  const trimmed = token.trim()
  if (trimmed.length > 0 && (trimmed.length > 200 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid Slack bot token.' })
  }

  try {
    await setSlackBotToken(trimmed)
    await reconnectSlack()
    res.json({ botTokenConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set slack bot token error:', err)
    res.status(500).json({ error: 'Failed to save the Slack bot token.' })
  }
})

// PUT /api/admin/config/slack/app-token — sets (or clears, with an empty
// string) the app-level (xapp-) token used for Socket Mode. Reconnects.
router.put('/config/slack/app-token', async (req, res) => {
  const { token } = req.body ?? {}

  if (typeof token !== 'string') {
    return res.status(400).json({ error: '"token" must be a string (empty to clear it).' })
  }
  const trimmed = token.trim()
  if (trimmed.length > 0 && (trimmed.length > 200 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid Slack app token.' })
  }

  try {
    await setSlackAppToken(trimmed)
    await reconnectSlack()
    res.json({ appTokenConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set slack app token error:', err)
    res.status(500).json({ error: 'Failed to save the Slack app token.' })
  }
})

// PUT /api/admin/config/slack/signing-secret — sets (or clears, with an empty
// string) the signing secret. Optional in Socket Mode. Reconnects.
router.put('/config/slack/signing-secret', async (req, res) => {
  const { secret } = req.body ?? {}

  if (typeof secret !== 'string') {
    return res.status(400).json({ error: '"secret" must be a string (empty to clear it).' })
  }
  const trimmed = secret.trim()
  if (trimmed.length > 0 && (trimmed.length > 200 || /\s/.test(trimmed))) {
    return res.status(400).json({ error: 'That does not look like a valid Slack signing secret.' })
  }

  try {
    await setSlackSigningSecret(trimmed)
    await reconnectSlack()
    res.json({ signingSecretConfigured: trimmed.length > 0 })
  } catch (err) {
    console.error('Admin set slack signing secret error:', err)
    res.status(500).json({ error: 'Failed to save the Slack signing secret.' })
  }
})

export default router
