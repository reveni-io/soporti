import OpenAI from 'openai'
import { setDefaultOpenAIClient } from '@openai/agents'
import { getOpenAIApiKey, getOpenAIModel } from './settings.js'

// The API key lives in the database (admin panel → OpenAI section), so the
// OpenAI SDK client is built lazily and rebuilt whenever the stored key
// changes. The same instance is registered as the Agents SDK default client so
// agent runs use the DB key too — rotating the key takes effect without a
// restart. Returns null when no key is configured.
let clientInstance = null
let clientInstanceKey = null

export async function getOpenAIClient() {
  const key = await getOpenAIApiKey()
  if (!key) return null
  if (!clientInstance || clientInstanceKey !== key) {
    clientInstance = new OpenAI({ apiKey: key })
    clientInstanceKey = key
    // Keep the Agents SDK in sync: agent runs resolve their model through the
    // default client, which must carry the DB-configured key.
    setDefaultOpenAIClient(clientInstance)
  }
  return clientInstance
}

// Resolves what an Agent factory needs: registers the DB key as the Agents SDK
// default client and returns the configured model. Call at the top of every
// Agent factory so key rotations and model changes take effect without a
// restart. Throws a clear error when the API key or the model is not configured
// (there is no default model — the operator must pick one in the admin panel).
export async function resolveModelForAgent() {
  const client = await getOpenAIClient()
  if (!client) {
    throw new Error('OpenAI API key not configured. Set it in the admin panel (OpenAI section).')
  }
  const model = await getOpenAIModel()
  if (!model) {
    throw new Error('OpenAI model not configured. Set it in the admin panel (OpenAI section).')
  }
  return model
}

// The Agents SDK injects implicit defaults for gpt-5* models
// (`reasoning.effort: 'low'`, `text.verbosity: 'low'`) whenever an agent sets
// no modelSettings of its own. Codex models (gpt-5.x-codex) only accept
// `medium` for both, so those defaults 400 every request. Returning explicit
// modelSettings both satisfies codex AND suppresses the implicit low defaults.
// Returns null for non-codex models so callers leave the SDK defaults in place.
const CODEX_MODELS = /codex/i

export function codexModelSettings(model) {
  return CODEX_MODELS.test(model) ? { reasoning: { effort: 'medium' }, text: { verbosity: 'medium' } } : null
}

// Test-only: drop the memoized client so a new key is picked up.
export function _resetClientForTests() {
  clientInstance = null
  clientInstanceKey = null
}
