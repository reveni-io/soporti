function apiBase() {
  return import.meta.env.VITE_API_URL || ''
}

function apiUrl(path) {
  return `${apiBase()}${path}`
}

export function absoluteApiUrl(path) {
  return `${apiBase() || window.location.origin}${path}`
}

export function absoluteAppUrl(path) {
  return `${window.location.origin}${path}`
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function isUnauthorized(error) {
  return error?.status === 401
}

async function readJson(response) {
  try {
    return (await response.json()) ?? {}
  } catch {
    return {}
  }
}

function send(path, { method = 'GET', token, body, file, contentType, signal } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (file) headers['Content-Type'] = contentType
  else if (body !== undefined) headers['Content-Type'] = 'application/json'

  const payload = file ?? (body === undefined ? undefined : JSON.stringify(body))

  return fetch(apiUrl(path), {
    method,
    headers,
    ...(payload === undefined ? {} : { body: payload }),
    ...(signal ? { signal } : {}),
  })
}

async function assertOk(response, errorMessage) {
  if (response.ok) return
  const data = await readJson(response)
  throw new ApiError(data.error || errorMessage || `HTTP ${response.status}`, response.status)
}

async function request(path, options = {}) {
  const response = await send(path, options)
  await assertOk(response, options.errorMessage)
  return readJson(response)
}

export function getAuthMethods() {
  return request('/api/auth/methods', { errorMessage: 'unavailable' })
}

export function signInWithGoogle(credential) {
  return request('/api/auth/google', { method: 'POST', body: { credential }, errorMessage: 'Login failed' })
}

export function signInWithPassword(email, password) {
  return request('/api/auth/login', { method: 'POST', body: { email, password }, errorMessage: 'Login failed' })
}

export function createFirstAdmin(email, password, name, setupCode) {
  return request('/api/admin/bootstrap', {
    method: 'POST',
    body: { email, password, name, setupCode },
    errorMessage: 'Login failed',
  })
}

export function getAdminStatus() {
  return request('/api/admin/status', { errorMessage: 'Failed to check the admin status' })
}

export function getRepos(token) {
  return request('/api/repos', { token, errorMessage: 'Failed to fetch repos' })
}

export function getIntegrations(token) {
  return request('/api/integrations', { token, errorMessage: 'Failed to load the integrations' })
}

export function getStats(token) {
  return request('/api/stats', { token, errorMessage: 'Failed to load the stats' })
}

export function getAdminStats(token, hours) {
  return request(`/api/admin/stats?hours=${hours}`, { token, errorMessage: 'Failed to load the stats' })
}

export async function streamChat(token, body, signal) {
  const response = await send('/api/chat', { method: 'POST', token, body, signal })
  await assertOk(response, 'Server error')
  return response
}

export function uploadAttachment(token, file, contentType, name) {
  return request(`/api/attachments?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    token,
    file,
    contentType,
    errorMessage: 'Failed to read the file',
  })
}

export function getAttachmentImage(token, imageId) {
  return request(`/api/attachments/images/${imageId}`, { token, errorMessage: 'Failed to load the image' })
}

export function saveAttachmentThumbnail(token, imageId, thumbnail) {
  return request(`/api/attachments/images/${imageId}/thumbnail`, {
    method: 'PUT',
    token,
    body: { thumbnail },
    errorMessage: 'Failed to save the thumbnail',
  })
}

export function getConversations(token) {
  return request('/api/conversations', { token, errorMessage: 'Failed to load the conversations' })
}

export function getConversation(token, id) {
  return request(`/api/conversations/${id}`, { token })
}

export function deleteConversation(token, id) {
  return request(`/api/conversations/${id}`, { method: 'DELETE', token })
}

export function createShare(token, conversationId) {
  return request('/api/share', {
    method: 'POST',
    token,
    body: { conversationId },
    errorMessage: 'Failed to create share',
  })
}

export function getSharedConversation(shareId) {
  return request(`/api/share/${shareId}`, { errorMessage: 'not_found' })
}

export function sendFeedback(token, feedbackId, useful) {
  return request('/api/feedback', { method: 'POST', token, body: { feedbackId, useful } })
}

export function renderMermaid(token, chart) {
  return request('/api/mermaid/render', { method: 'POST', token, body: { chart } })
}

export function getArtifact(token, id) {
  return request(`/api/artifacts/${id}`, { token, errorMessage: 'Failed to load the artifact' })
}

export function getArtifactHtml(token, id, version) {
  const query = version ? `?version=${version}` : ''
  return request(`/api/artifacts/${id}/html${query}`, { token, errorMessage: 'Failed to load the artifact' })
}

export function listArtifacts(token) {
  return request('/api/artifacts', { token, errorMessage: 'Failed to load your artifacts' })
}

export function deleteArtifact(token, id) {
  return request(`/api/artifacts/${id}`, {
    method: 'DELETE',
    token,
    errorMessage: 'Failed to delete the artifact',
  })
}

export function deleteArtifactVersion(token, id, version) {
  return request(`/api/artifacts/${id}/versions/${version}`, {
    method: 'DELETE',
    token,
    errorMessage: 'Failed to delete the artifact version',
  })
}

export function shareArtifact(token, id, version) {
  return request(`/api/artifacts/${id}/share`, {
    method: 'POST',
    token,
    body: { version },
    errorMessage: 'Failed to share the artifact',
  })
}

export function getSharedArtifact(shareId) {
  return request(`/api/share/artifact/${shareId}`, { errorMessage: 'Failed to load the shared artifact' })
}

export function getUserInstructions(token) {
  return request('/api/user/instructions', { token, errorMessage: 'Failed to load instructions' })
}

export function saveUserInstructions(token, instructions) {
  return request('/api/user/instructions', {
    method: 'PUT',
    token,
    body: { instructions },
    errorMessage: 'Failed to save',
  })
}

export function getGranolaConnection(token) {
  return request('/api/user/granola', { token, errorMessage: 'Failed to load the Granola connection' })
}

export function saveGranolaApiKey(token, apiKey) {
  return request('/api/user/granola', {
    method: 'PUT',
    token,
    body: { apiKey },
    errorMessage: 'Failed to save the Granola API key',
  })
}

export function getSkills(token) {
  return request('/api/skills', { token, errorMessage: 'Failed to load skills' })
}

export function getSkill(token, id) {
  return request(`/api/skills/${id}`, { token, errorMessage: 'Failed to load the skill.' })
}

export function createSkill(token, skill) {
  return request('/api/skills', { method: 'POST', token, body: skill, errorMessage: 'Failed to save skill' })
}

export function updateSkill(token, id, skill) {
  return request(`/api/skills/${id}`, { method: 'PUT', token, body: skill, errorMessage: 'Failed to save skill' })
}

export function deleteSkill(token, id) {
  return request(`/api/skills/${id}`, { method: 'DELETE', token, errorMessage: 'Failed to delete skill' })
}

export function getApiKeys(token) {
  return request('/api/api-keys', { token, errorMessage: 'Failed to load the API keys' })
}

export function createApiKey(token, apiKey) {
  return request('/api/api-keys', {
    method: 'POST',
    token,
    body: apiKey,
    errorMessage: 'Failed to create the API key',
  })
}

export function revokeApiKey(token, id) {
  return request(`/api/api-keys/${id}`, {
    method: 'DELETE',
    token,
    errorMessage: 'Failed to revoke the API key',
  })
}

export function decideOAuthAuthorization(token, authorization) {
  return request('/api/oauth/authorize', {
    method: 'POST',
    token,
    body: authorization,
    errorMessage: 'Failed to authorize the connection',
  })
}

export function getSchedules(token) {
  return request('/api/schedules', { token, errorMessage: 'Failed to load the scheduled queries' })
}

export function createSchedule(token, schedule) {
  return request('/api/schedules', {
    method: 'POST',
    token,
    body: schedule,
    errorMessage: 'Failed to create the scheduled query',
  })
}

export function deleteSchedule(token, id) {
  return request(`/api/schedules/${id}`, {
    method: 'DELETE',
    token,
    errorMessage: 'Failed to delete the scheduled query',
  })
}

export function getAdminUsers(token) {
  return request('/api/admin/users', { token, errorMessage: 'Failed to load users' })
}

export function createAdminUser(token, user) {
  return request('/api/admin/users', {
    method: 'POST',
    token,
    body: user,
    errorMessage: 'Failed to create the user',
  })
}

export function getAuthConfig(token) {
  return request('/api/admin/config/auth', { token, errorMessage: 'Failed to load the authentication settings' })
}

export function saveAuthMethods(token, methods) {
  return request('/api/admin/config/auth/methods', {
    method: 'PUT',
    token,
    body: methods,
    errorMessage: 'Failed to save',
  })
}

export function saveGoogleClientId(token, googleClientId) {
  return request('/api/admin/config/auth/google-client-id', {
    method: 'PUT',
    token,
    body: { googleClientId },
    errorMessage: 'Failed to save',
  })
}

export function saveAllowedDomains(token, domains) {
  return request('/api/admin/config/allowed-domains', {
    method: 'PUT',
    token,
    body: { domains },
    errorMessage: 'Failed to save',
  })
}

export function getLlmConfig(token) {
  return request('/api/admin/config/llm', { token, errorMessage: 'Failed to load the LLM settings' })
}

export function saveLlmProvider(token, provider) {
  return request('/api/admin/config/llm/provider', {
    method: 'PUT',
    token,
    body: { provider },
    errorMessage: 'Failed to save the provider',
  })
}

export function saveOpenAIApiKey(token, apiKey) {
  return request('/api/admin/config/openai/api-key', {
    method: 'PUT',
    token,
    body: { apiKey },
    errorMessage: 'Failed to save the API key',
  })
}

export function saveOpenAIModel(token, model) {
  return request('/api/admin/config/openai/model', {
    method: 'PUT',
    token,
    body: { model },
    errorMessage: 'Failed to save the model',
  })
}

export function saveAnthropicApiKey(token, apiKey) {
  return request('/api/admin/config/anthropic/api-key', {
    method: 'PUT',
    token,
    body: { apiKey },
    errorMessage: 'Failed to save the API key',
  })
}

export function saveReasoningEffort(token, effort) {
  return request('/api/admin/config/llm/reasoning-effort', {
    method: 'PUT',
    token,
    body: { effort },
    errorMessage: 'Failed to save the reasoning effort',
  })
}

export function saveAnthropicModel(token, model) {
  return request('/api/admin/config/anthropic/model', {
    method: 'PUT',
    token,
    body: { model },
    errorMessage: 'Failed to save the model',
  })
}

export function getSubagents(token) {
  return request('/api/admin/subagents', { token, errorMessage: 'Failed to load the subagents' })
}

export function createSubagent(token, subagent) {
  return request('/api/admin/subagents', {
    method: 'POST',
    token,
    body: subagent,
    errorMessage: 'Failed to save the subagent',
  })
}

export function updateSubagent(token, id, subagent) {
  return request(`/api/admin/subagents/${id}`, {
    method: 'PUT',
    token,
    body: subagent,
    errorMessage: 'Failed to save the subagent',
  })
}

export function deleteSubagent(token, id) {
  return request(`/api/admin/subagents/${id}`, {
    method: 'DELETE',
    token,
    errorMessage: 'Failed to delete the subagent',
  })
}

export function getKnowledgeConfig(token) {
  return request('/api/admin/config/knowledge', { token, errorMessage: 'Failed to load the knowledge base settings' })
}

export function saveKnowledgeApiKey(token, apiKey) {
  return request('/api/admin/config/knowledge/api-key', {
    method: 'PUT',
    token,
    body: { apiKey },
    errorMessage: 'Failed to save the API key',
  })
}

export function saveKnowledgeVectorStore(token, vectorStoreId) {
  return request('/api/admin/config/knowledge/vector-store', {
    method: 'PUT',
    token,
    body: { vectorStoreId },
    errorMessage: 'Failed to save the vector store id',
  })
}

export function getGithubConfig(token) {
  return request('/api/admin/config/github', { token, errorMessage: 'Failed to load the GitHub settings' })
}

export function saveGithubToken(token, value) {
  return request('/api/admin/config/github/token', {
    method: 'PUT',
    token,
    body: { token: value },
    errorMessage: 'Failed to save the token',
  })
}

export function saveGithubWebhookSecret(token, secret) {
  return request('/api/admin/config/github/webhook-secret', {
    method: 'PUT',
    token,
    body: { secret },
    errorMessage: 'Failed to save the webhook secret',
  })
}

export function saveGithubCatalog(token, catalog) {
  return request('/api/admin/config/github/catalog', {
    method: 'PUT',
    token,
    body: { catalog },
    errorMessage: 'Failed to save the catalog',
  })
}

export function getGoogleDriveConfig(token) {
  return request('/api/admin/config/google-drive', {
    token,
    errorMessage: 'Failed to load the Google Drive settings',
  })
}

export function saveGoogleDriveCredentials(token, credentials) {
  return request('/api/admin/config/google-drive/credentials', {
    method: 'PUT',
    token,
    body: { credentials },
    errorMessage: 'Failed to save the credentials',
  })
}

export function getNotionConfig(token) {
  return request('/api/admin/config/notion', { token, errorMessage: 'Failed to load the Notion settings' })
}

export function saveNotionToken(token, value) {
  return request('/api/admin/config/notion/token', {
    method: 'PUT',
    token,
    body: { token: value },
    errorMessage: 'Failed to save the token',
  })
}

export function getHelpjuiceConfig(token) {
  return request('/api/admin/config/helpjuice', { token, errorMessage: 'Failed to load the Helpjuice settings' })
}

export function saveHelpjuiceAccount(token, account) {
  return request('/api/admin/config/helpjuice/account', {
    method: 'PUT',
    token,
    body: { account },
    errorMessage: 'Failed to save the account',
  })
}

export function saveHelpjuiceApiKey(token, apiKey) {
  return request('/api/admin/config/helpjuice/api-key', {
    method: 'PUT',
    token,
    body: { apiKey },
    errorMessage: 'Failed to save the API key',
  })
}

export function getDatabaseConfig(token) {
  return request('/api/admin/config/postgres', { token, errorMessage: 'Failed to load the database settings' })
}

export function saveDatabaseConnection(token, connection) {
  return request('/api/admin/config/postgres/connection', {
    method: 'PUT',
    token,
    body: { connection },
    errorMessage: 'Failed to save the connection string',
  })
}

export function saveDatabaseMaxRows(token, maxRows) {
  return request('/api/admin/config/postgres/max-rows', {
    method: 'PUT',
    token,
    body: { maxRows },
    errorMessage: 'Failed to save the row limit',
  })
}

export function getShopifyConfig(token) {
  return request('/api/admin/config/shopify', { token, errorMessage: 'Failed to load the Shopify settings' })
}

export function saveShopifyTokenQuery(token, tokenQuery) {
  return request('/api/admin/config/shopify/token-query', {
    method: 'PUT',
    token,
    body: { tokenQuery },
    errorMessage: 'Failed to save the token query',
  })
}

export function draftShopifyTokenQuery(token) {
  return request('/api/admin/config/shopify/draft-token-query', {
    method: 'POST',
    token,
    errorMessage: 'Failed to draft the token query',
  })
}

export function getShortcutConfig(token) {
  return request('/api/admin/config/shortcut', { token, errorMessage: 'Failed to load the Shortcut settings' })
}

export function saveShortcutToken(token, value) {
  return request('/api/admin/config/shortcut/token', {
    method: 'PUT',
    token,
    body: { token: value },
    errorMessage: 'Failed to save the token',
  })
}

export function getSentryConfig(token) {
  return request('/api/admin/config/sentry', { token, errorMessage: 'Failed to load the Sentry settings' })
}

export function saveSentryOrg(token, org) {
  return request('/api/admin/config/sentry/org', {
    method: 'PUT',
    token,
    body: { org },
    errorMessage: 'Failed to save the organization',
  })
}

export function saveSentryAuthToken(token, value) {
  return request('/api/admin/config/sentry/auth-token', {
    method: 'PUT',
    token,
    body: { token: value },
    errorMessage: 'Failed to save the auth token',
  })
}

export function getBetterstackConfig(token) {
  return request('/api/admin/config/betterstack', { token, errorMessage: 'Failed to load the Better Stack settings' })
}

export function saveBetterstackApiToken(token, value) {
  return request('/api/admin/config/betterstack/api-token', {
    method: 'PUT',
    token,
    body: { token: value },
    errorMessage: 'Failed to save the API token',
  })
}

export function saveBetterstackConnectHost(token, host) {
  return request('/api/admin/config/betterstack/connect-host', {
    method: 'PUT',
    token,
    body: { host },
    errorMessage: 'Failed to save the connect host',
  })
}

export function saveBetterstackConnectionUsername(token, username) {
  return request('/api/admin/config/betterstack/connection-username', {
    method: 'PUT',
    token,
    body: { username },
    errorMessage: 'Failed to save the connection username',
  })
}

export function saveBetterstackConnectionPassword(token, password) {
  return request('/api/admin/config/betterstack/connection-password', {
    method: 'PUT',
    token,
    body: { password },
    errorMessage: 'Failed to save the connection password',
  })
}

export function getSlackConfig(token) {
  return request('/api/admin/config/slack', { token, errorMessage: 'Failed to load the Slack settings' })
}

export function saveSlackCredential(token, { endpoint, bodyKey, value }) {
  return request(`/api/admin/config/slack/${endpoint}`, {
    method: 'PUT',
    token,
    body: { [bodyKey]: value },
    errorMessage: 'Failed to save',
  })
}
