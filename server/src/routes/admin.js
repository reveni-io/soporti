import { Router } from 'express'
import { createSession, requireAdmin } from '../middleware/auth.js'
import adminStatsRouter from './admin-stats.js'
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
  getBetterstackApiToken,
  setBetterstackApiToken,
  getBetterstackConnectHost,
  setBetterstackConnectHost,
  getBetterstackUsername,
  setBetterstackUsername,
  getBetterstackPassword,
  setBetterstackPassword,
} from '../betterstack/settings.js'
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
} from '../llm/settings.js'
import { DEFAULT_PROVIDER, isKnownProvider, listProviders } from '../llm/registry.js'
import { getMainAgentTools, setMainAgentTools } from '../agent/settings.js'
import {
  DEFAULT_REASONING_EFFORT,
  MAX_ACTIVE_SUBAGENTS,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_SUBAGENT_DESCRIPTION_LENGTH,
  MAX_SUBAGENT_NAME_LENGTH,
  MAX_SUBAGENT_TOOLS,
  REASONING_EFFORT_LEVELS,
  SUBAGENT_NAME_RE,
} from '../constants.js'
import { listSubagents, createSubagent, updateSubagent, deleteSubagent } from '../db/subagents.js'
import { INTEGRATION_TOOL_NAMES } from '../agent/sources.js'
import { INTEGRATIONS } from '../agent/integrations.js'
import { REPO_TOOL_NAMES, SELECTABLE_TOOL_NAMES } from '../agent/tools.js'
import { isShortcutConfigured } from '../shortcut/settings.js'
import { isSentryConfigured } from '../sentry/settings.js'
import { isDriveConfigured } from '../google-drive/settings.js'
import { isNotionConfigured } from '../notion/settings.js'
import { isHelpjuiceConfigured } from '../helpjuice/settings.js'
import { isPostgresConfigured } from '../postgres/settings.js'
import { isBetterstackConfigured } from '../betterstack/settings.js'
import { isGranolaConfigured } from '../granola/settings.js'
import { isConfigured as isShopifyConfigured } from '../shopify/client.js'
import {
  getOwnApiKey,
  getKnowledgeApiKey,
  setKnowledgeApiKey,
  getVectorStoreId,
  setVectorStoreId,
} from '../knowledge/settings.js'
import { countAdmins, setAdminCredentials, createUserWithPassword, listUsers, findUserByEmail } from '../db/users.js'
import { clearStatsCache } from './stats.js'

const router = Router()

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN_REGEX = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/
const HOST_REGEX = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/
const ID_RE = /^\d{1,9}$/
const API_KEY_MAX_LENGTH = 300
const MODEL_ID_MAX_LENGTH = 100
const VECTOR_STORE_ID_MAX_LENGTH = 200
const INVALID_HOST_ERROR = 'That does not look like a valid connect host (e.g. "eu-nbg-2-connect.betterstackdata.com").'
const REPO_TOOL_GROUP = { id: 'repo', label: 'Repositories', tools: [...REPO_TOOL_NAMES] }
const GLOBAL_MODEL_GETTERS = { openai: getOpenAIModel, anthropic: getAnthropicModel }
const INTEGRATION_CHECKS = {
  shortcut: isShortcutConfigured,
  notion: isNotionConfigured,
  'google-drive': isDriveConfigured,
  postgres: isPostgresConfigured,
  sentry: isSentryConfigured,
  betterstack: isBetterstackConfigured,
  helpjuice: isHelpjuiceConfigured,
  shopify: isShopifyConfigured,
  granola: isGranolaConfigured,
}

function validEmail(email) {
  return typeof email === 'string' && email.trim().length <= 254 && EMAIL_REGEX.test(email.trim())
}

function parseSecret(value, { field, maxLength, message }) {
  if (typeof value !== 'string') return { error: `"${field}" must be a string (empty to clear it).` }

  const trimmed = value.trim()
  if (trimmed.length > 0 && (trimmed.length > maxLength || /\s/.test(trimmed))) {
    return { error: message }
  }

  return { value: trimmed }
}

function parseApiKey(value) {
  return parseSecret(value, {
    field: 'apiKey',
    maxLength: API_KEY_MAX_LENGTH,
    message: 'That does not look like a valid API key.',
  })
}

function parseModelId(value) {
  return parseSecret(value, {
    field: 'model',
    maxLength: MODEL_ID_MAX_LENGTH,
    message: 'That does not look like a valid model id.',
  })
}

function invalidName(name) {
  return name !== undefined && name !== null && (typeof name !== 'string' || name.length > 200)
}

router.get('/status', async (_req, res) => {
  try {
    res.json({ adminExists: (await countAdmins()) > 0 })
  } catch (err) {
    console.error('Admin status error:', err)
    res.status(500).json({ error: 'Failed to check admin status.' })
  }
})

router.post('/bootstrap', async (req, res) => {
  const { email, password, name, setupCode } = req.body ?? {}

  try {
    if ((await countAdmins()) > 0) {
      return res.status(403).json({ error: 'An admin account already exists.' })
    }

    if (!verifySetupCode(setupCode)) {
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

router.use(requireAdmin)

router.use('/stats', adminStatsRouter)

router.get('/users', async (_req, res) => {
  try {
    res.json({ users: await listUsers() })
  } catch (err) {
    console.error('Admin list users error:', err)
    res.status(500).json({ error: 'Failed to list users.' })
  }
})

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
      googleClientId: googleClientId ?? '',
    })
  } catch (err) {
    console.error('Admin get auth config error:', err)
    res.status(500).json({ error: 'Failed to read the authentication settings.' })
  }
})

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

router.get('/config/allowed-domains', async (_req, res) => {
  try {
    res.json({ domains: await getAllowedDomains() })
  } catch (err) {
    console.error('Admin get allowed domains error:', err)
    res.status(500).json({ error: 'Failed to read allowed domains.' })
  }
})

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

router.get('/config/llm', async (_req, res) => {
  try {
    const [provider, openaiApiKey, openaiModel, anthropicApiKey, anthropicModel, reasoningEffort] = await Promise.all([
      getLlmProvider(),
      getOpenAIApiKey(),
      getOpenAIModel(),
      getAnthropicApiKey(),
      getAnthropicModel(),
      getReasoningEffort(),
    ])

    res.json({
      provider: isKnownProvider(provider) ? provider : DEFAULT_PROVIDER,
      providers: listProviders(),
      openaiApiKeyConfigured: Boolean(openaiApiKey),
      openaiModel: openaiModel ?? '',
      anthropicApiKeyConfigured: Boolean(anthropicApiKey),
      anthropicModel: anthropicModel ?? '',
      reasoningEffort: REASONING_EFFORT_LEVELS.includes(reasoningEffort) ? reasoningEffort : DEFAULT_REASONING_EFFORT,
      reasoningEffortLevels: REASONING_EFFORT_LEVELS,
    })
  } catch (err) {
    console.error('Admin get llm config error:', err)
    res.status(500).json({ error: 'Failed to read the LLM settings.' })
  }
})

router.put('/config/llm/provider', async (req, res) => {
  const { provider } = req.body ?? {}

  if (typeof provider !== 'string' || !isKnownProvider(provider)) {
    return res.status(400).json({ error: 'That is not a supported LLM provider.' })
  }

  try {
    await setLlmProvider(provider)
    res.json({ provider })
  } catch (err) {
    console.error('Admin set llm provider error:', err)
    res.status(500).json({ error: 'Failed to save the LLM provider.' })
  }
})

router.put('/config/llm/reasoning-effort', async (req, res) => {
  const { effort } = req.body ?? {}

  if (typeof effort !== 'string' || !REASONING_EFFORT_LEVELS.includes(effort)) {
    return res.status(400).json({ error: 'That is not a supported reasoning effort.' })
  }

  try {
    await setReasoningEffort(effort)
    res.json({ effort })
  } catch (err) {
    console.error('Admin set reasoning effort error:', err)
    res.status(500).json({ error: 'Failed to save the reasoning effort.' })
  }
})

router.put('/config/openai/api-key', async (req, res) => {
  const { error, value } = parseApiKey(req.body?.apiKey)
  if (error) return res.status(400).json({ error })

  try {
    await setOpenAIApiKey(value)
    clearStatsCache()
    res.json({ apiKeyConfigured: value.length > 0 })
  } catch (err) {
    console.error('Admin set openai api key error:', err)
    res.status(500).json({ error: 'Failed to save the OpenAI API key.' })
  }
})

router.put('/config/openai/model', async (req, res) => {
  const { error, value } = parseModelId(req.body?.model)
  if (error) return res.status(400).json({ error })

  try {
    await setOpenAIModel(value)
    res.json({ model: value })
  } catch (err) {
    console.error('Admin set openai model error:', err)
    res.status(500).json({ error: 'Failed to save the model.' })
  }
})

router.put('/config/anthropic/api-key', async (req, res) => {
  const { error, value } = parseApiKey(req.body?.apiKey)
  if (error) return res.status(400).json({ error })

  try {
    await setAnthropicApiKey(value)
    res.json({ apiKeyConfigured: value.length > 0 })
  } catch (err) {
    console.error('Admin set anthropic api key error:', err)
    res.status(500).json({ error: 'Failed to save the Anthropic API key.' })
  }
})

router.put('/config/anthropic/model', async (req, res) => {
  const { error, value } = parseModelId(req.body?.model)
  if (error) return res.status(400).json({ error })

  try {
    await setAnthropicModel(value)
    res.json({ model: value })
  } catch (err) {
    console.error('Admin set anthropic model error:', err)
    res.status(500).json({ error: 'Failed to save the model.' })
  }
})

async function resolveToolGroups(userId) {
  const ids = Object.keys(INTEGRATION_TOOL_NAMES)
  const flags = await Promise.all(ids.map(id => INTEGRATION_CHECKS[id](userId)))

  const groups = ids.map((id, index) => ({
    id,
    label: INTEGRATIONS[id].label,
    configured: flags[index],
    tools: INTEGRATION_TOOL_NAMES[id],
  }))

  return [{ ...REPO_TOOL_GROUP, configured: true }, ...groups]
}

async function resolveGlobalSelection() {
  const stored = await getLlmProvider()
  const provider = isKnownProvider(stored) ? stored : DEFAULT_PROVIDER

  return { provider, model: (await GLOBAL_MODEL_GETTERS[provider]()) ?? '' }
}

function parseProviderSelection(provider, model) {
  if (provider != null && (typeof provider !== 'string' || !isKnownProvider(provider))) {
    return { error: 'That is not a supported LLM provider.' }
  }

  const trimmedModel = typeof model === 'string' ? model.trim() : model
  if (
    trimmedModel != null &&
    (typeof trimmedModel !== 'string' || trimmedModel.length === 0 || trimmedModel.length > MODEL_ID_MAX_LENGTH)
  ) {
    return { error: 'A model is required when you pick a provider.' }
  }

  if ((provider == null) !== (trimmedModel == null)) {
    return { error: 'Pick both a provider and a model, or leave both empty to follow the global selection.' }
  }

  return { value: { provider: provider ?? null, model: trimmedModel ?? null } }
}

function parseToolNames(names) {
  const unique = []

  for (const name of names) {
    if (typeof name !== 'string' || !SELECTABLE_TOOL_NAMES.has(name)) {
      return { error: `"${name}" is not a tool the assistant can grant.` }
    }
    if (!unique.includes(name)) unique.push(name)
  }

  return { value: unique }
}

function parseMainAgentTools(tools) {
  if (tools === null) return { value: null }
  if (!Array.isArray(tools)) {
    return { error: 'Tools must be an array of tool names, or null to allow every tool.' }
  }

  return parseToolNames(tools)
}

function parseSubagentTools(tools) {
  if (tools !== undefined && !Array.isArray(tools)) return { error: 'Tools must be an array of tool names.' }

  const requested = tools ?? []
  if (requested.length > MAX_SUBAGENT_TOOLS) {
    return { error: `A subagent can hold at most ${MAX_SUBAGENT_TOOLS} tools.` }
  }

  return parseToolNames(requested)
}

function parseSubagentInput(body) {
  const { name, description, instructions, provider, model, tools, exclusive, enabled } = body ?? {}

  if (typeof name !== 'string' || !SUBAGENT_NAME_RE.test(name)) {
    return {
      error: `Name must be 2-${MAX_SUBAGENT_NAME_LENGTH} characters using lowercase letters, numbers and underscores, starting with a letter.`,
    }
  }

  const trimmedDescription = typeof description === 'string' ? description.trim() : ''
  if (trimmedDescription.length === 0) {
    return { error: 'A description is required — it is what tells the assistant when to use this subagent.' }
  }
  if (trimmedDescription.length > MAX_SUBAGENT_DESCRIPTION_LENGTH) {
    return { error: `Description is too long (max ${MAX_SUBAGENT_DESCRIPTION_LENGTH} characters).` }
  }

  if (typeof instructions !== 'string' || instructions.trim().length === 0) {
    return { error: 'Instructions are required.' }
  }
  if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    return { error: `Instructions are too long (max ${MAX_INSTRUCTIONS_LENGTH} characters).` }
  }

  const selection = parseProviderSelection(provider, model)
  if (selection.error) return { error: selection.error }

  const selectedTools = parseSubagentTools(tools)
  if (selectedTools.error) return { error: selectedTools.error }

  if (exclusive !== undefined && typeof exclusive !== 'boolean') return { error: 'Exclusive must be true or false.' }
  if (enabled !== undefined && typeof enabled !== 'boolean') return { error: 'Enabled must be true or false.' }

  return {
    value: {
      name,
      description: trimmedDescription,
      instructions,
      provider: selection.value.provider,
      model: selection.value.model,
      tools: selectedTools.value,
      exclusive: exclusive ?? false,
      enabled: enabled ?? true,
    },
  }
}

function findExclusiveConflict(rows, input, editingId) {
  if (!input.exclusive || !input.enabled) return null

  for (const row of rows) {
    if (row.id === editingId || !row.exclusive || !row.enabled) continue

    const claimed = input.tools.find(name => row.tools.includes(name))
    if (claimed) return { tool: claimed, owner: row.name }
  }

  return null
}

function exceedsEnabledCap(rows, input, editingId) {
  if (!input.enabled) return false

  return rows.filter(row => row.id !== editingId && row.enabled).length >= MAX_ACTIVE_SUBAGENTS
}

async function rejectSubagentConflicts(res, input, editingId) {
  const rows = await listSubagents()

  const conflict = findExclusiveConflict(rows, input, editingId)
  if (conflict) {
    res.status(409).json({
      error: `"${conflict.tool}" already belongs to the subagent "${conflict.owner}". A tool can only be taken away from the main agent once.`,
    })
    return true
  }

  if (exceedsEnabledCap(rows, input, editingId)) {
    res
      .status(422)
      .json({ error: `You can have at most ${MAX_ACTIVE_SUBAGENTS} enabled subagents. Disable one first.` })
    return true
  }

  return false
}

router.get('/subagents', async (req, res) => {
  try {
    const [subagents, tools, global, mainAgentTools] = await Promise.all([
      listSubagents(),
      resolveToolGroups(req.user.id),
      resolveGlobalSelection(),
      getMainAgentTools(),
    ])

    res.json({
      subagents,
      providers: listProviders(),
      tools: { groups: tools },
      globalProvider: global.provider,
      globalModel: global.model,
      mainAgentTools,
    })
  } catch (err) {
    console.error('Admin list subagents error:', err)
    res.status(500).json({ error: 'Failed to load the subagents.' })
  }
})

router.put('/agent/tools', async (req, res) => {
  const { error, value } = parseMainAgentTools(req.body?.tools)
  if (error) return res.status(400).json({ error })

  try {
    await setMainAgentTools(value)
    res.json({ tools: value })
  } catch (err) {
    console.error('Admin set main agent tools error:', err)
    res.status(500).json({ error: 'Failed to save the main agent tools.' })
  }
})

router.post('/subagents', async (req, res) => {
  const { error, value } = parseSubagentInput(req.body)
  if (error) return res.status(400).json({ error })

  try {
    if (await rejectSubagentConflicts(res, value, null)) return

    res.status(201).json({ subagent: await createSubagent(value) })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A subagent with this name already exists.' })
    console.error('Admin create subagent error:', err)
    res.status(500).json({ error: 'Failed to create the subagent.' })
  }
})

router.put('/subagents/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid subagent ID.' })

  const { error, value } = parseSubagentInput(req.body)
  if (error) return res.status(400).json({ error })

  const id = Number(req.params.id)

  try {
    if (await rejectSubagentConflicts(res, value, id)) return

    const subagent = await updateSubagent(id, value)
    if (!subagent) return res.status(404).json({ error: 'Subagent not found.' })

    res.json({ subagent })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A subagent with this name already exists.' })
    console.error('Admin update subagent error:', err)
    res.status(500).json({ error: 'Failed to update the subagent.' })
  }
})

router.delete('/subagents/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid subagent ID.' })

  try {
    const removed = await deleteSubagent(Number(req.params.id))
    if (!removed) return res.status(404).json({ error: 'Subagent not found.' })

    res.json({ deleted: true })
  } catch (err) {
    console.error('Admin delete subagent error:', err)
    res.status(500).json({ error: 'Failed to delete the subagent.' })
  }
})

router.get('/config/knowledge', async (_req, res) => {
  try {
    const [ownApiKey, effectiveApiKey, vectorStoreId] = await Promise.all([
      getOwnApiKey(),
      getKnowledgeApiKey(),
      getVectorStoreId(),
    ])

    res.json({
      apiKeyConfigured: Boolean(ownApiKey),
      keyAvailable: Boolean(effectiveApiKey),
      vectorStoreId: vectorStoreId ?? '',
    })
  } catch (err) {
    console.error('Admin get knowledge config error:', err)
    res.status(500).json({ error: 'Failed to read the knowledge base settings.' })
  }
})

router.put('/config/knowledge/api-key', async (req, res) => {
  const { error, value } = parseApiKey(req.body?.apiKey)
  if (error) return res.status(400).json({ error })

  try {
    await setKnowledgeApiKey(value)
    clearStatsCache()
    res.json({ apiKeyConfigured: value.length > 0, keyAvailable: Boolean(await getKnowledgeApiKey()) })
  } catch (err) {
    console.error('Admin set knowledge api key error:', err)
    res.status(500).json({ error: 'Failed to save the knowledge base API key.' })
  }
})

router.put('/config/knowledge/vector-store', async (req, res) => {
  const { error, value } = parseSecret(req.body?.vectorStoreId, {
    field: 'vectorStoreId',
    maxLength: VECTOR_STORE_ID_MAX_LENGTH,
    message: 'That does not look like a valid vector store id.',
  })
  if (error) return res.status(400).json({ error })

  try {
    await setVectorStoreId(value)
    clearStatsCache()
    res.json({ vectorStoreId: value })
  } catch (err) {
    console.error('Admin set knowledge vector store error:', err)
    res.status(500).json({ error: 'Failed to save the vector store id.' })
  }
})

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

router.get('/config/notion', async (_req, res) => {
  try {
    const token = await getNotionToken()
    res.json({ tokenConfigured: Boolean(token) })
  } catch (err) {
    console.error('Admin get notion config error:', err)
    res.status(500).json({ error: 'Failed to read the Notion settings.' })
  }
})

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

router.get('/config/shortcut', async (_req, res) => {
  try {
    const token = await getShortcutToken()
    res.json({ tokenConfigured: Boolean(token) })
  } catch (err) {
    console.error('Admin get shortcut config error:', err)
    res.status(500).json({ error: 'Failed to read the Shortcut settings.' })
  }
})

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

router.get('/config/helpjuice', async (_req, res) => {
  try {
    const [apiKey, account] = await Promise.all([getHelpjuiceApiKey(), getHelpjuiceAccount()])
    res.json({ apiKeyConfigured: Boolean(apiKey), account: account ?? '' })
  } catch (err) {
    console.error('Admin get helpjuice config error:', err)
    res.status(500).json({ error: 'Failed to read the Helpjuice settings.' })
  }
})

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

router.get('/config/sentry', async (_req, res) => {
  try {
    const [token, org] = await Promise.all([getSentryToken(), getSentryOrg()])
    res.json({ tokenConfigured: Boolean(token), org: org ?? '' })
  } catch (err) {
    console.error('Admin get sentry config error:', err)
    res.status(500).json({ error: 'Failed to read the Sentry settings.' })
  }
})

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

router.get('/config/betterstack', async (_req, res) => {
  try {
    const [token, host, username, password] = await Promise.all([
      getBetterstackApiToken(),
      getBetterstackConnectHost(),
      getBetterstackUsername(),
      getBetterstackPassword(),
    ])
    res.json({
      tokenConfigured: Boolean(token),
      host: host ?? '',
      username: username ?? '',
      passwordConfigured: Boolean(password),
    })
  } catch (err) {
    console.error('Admin get betterstack config error:', err)
    res.status(500).json({ error: 'Failed to read the Better Stack settings.' })
  }
})

router.put('/config/betterstack/api-token', async (req, res) => {
  const parsed = parseSecret(req.body?.token, {
    field: 'token',
    maxLength: API_KEY_MAX_LENGTH,
    message: 'That does not look like a valid Better Stack API token.',
  })
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    await setBetterstackApiToken(parsed.value)
    res.json({ tokenConfigured: parsed.value.length > 0 })
  } catch (err) {
    console.error('Admin set betterstack api token error:', err)
    res.status(500).json({ error: 'Failed to save the Better Stack API token.' })
  }
})

router.put('/config/betterstack/connect-host', async (req, res) => {
  const parsed = parseSecret(req.body?.host, {
    field: 'host',
    maxLength: API_KEY_MAX_LENGTH,
    message: INVALID_HOST_ERROR,
  })
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  const normalized = parsed.value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  if (normalized.length > 0 && !HOST_REGEX.test(normalized)) {
    return res.status(400).json({ error: INVALID_HOST_ERROR })
  }

  try {
    await setBetterstackConnectHost(normalized)
    res.json({ host: normalized })
  } catch (err) {
    console.error('Admin set betterstack connect host error:', err)
    res.status(500).json({ error: 'Failed to save the Better Stack connect host.' })
  }
})

router.put('/config/betterstack/connection-username', async (req, res) => {
  const parsed = parseSecret(req.body?.username, {
    field: 'username',
    maxLength: API_KEY_MAX_LENGTH,
    message: 'That does not look like a valid Better Stack connection username.',
  })
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    await setBetterstackUsername(parsed.value)
    res.json({ username: parsed.value })
  } catch (err) {
    console.error('Admin set betterstack connection username error:', err)
    res.status(500).json({ error: 'Failed to save the Better Stack connection username.' })
  }
})

router.put('/config/betterstack/connection-password', async (req, res) => {
  const parsed = parseSecret(req.body?.password, {
    field: 'password',
    maxLength: API_KEY_MAX_LENGTH,
    message: 'That does not look like a valid Better Stack connection password.',
  })
  if (parsed.error) return res.status(400).json({ error: parsed.error })

  try {
    await setBetterstackPassword(parsed.value)
    res.json({ passwordConfigured: parsed.value.length > 0 })
  } catch (err) {
    console.error('Admin set betterstack connection password error:', err)
    res.status(500).json({ error: 'Failed to save the Better Stack connection password.' })
  }
})

router.get('/config/postgres', async (_req, res) => {
  try {
    const [connection, maxRows] = await Promise.all([getPostgresConnection(), getPostgresMaxRows()])
    res.json({ connectionConfigured: Boolean(connection), maxRows })
  } catch (err) {
    console.error('Admin get postgres config error:', err)
    res.status(500).json({ error: 'Failed to read the database settings.' })
  }
})

router.put('/config/postgres/connection', async (req, res) => {
  const { connection } = req.body ?? {}

  if (typeof connection !== 'string') {
    return res.status(400).json({ error: '"connection" must be a string (empty to clear it).' })
  }
  const trimmed = connection.trim()
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

router.put('/config/postgres/max-rows', async (req, res) => {
  const { maxRows } = req.body ?? {}

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

async function reconnectSlack() {
  try {
    await restartSlackBot()
  } catch (err) {
    console.error('Admin slack reconnect error:', err.message)
  }
}

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
