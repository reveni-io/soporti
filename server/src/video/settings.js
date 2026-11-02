import { getConfigValue, setConfigValue } from '../db/app-config.js'
import { getLlmProvider, getProviderModel } from '../llm/settings.js'
import { DEFAULT_PROVIDER, isKnownProvider } from '../llm/registry.js'
import { isProviderConfigured } from '../llm/model.js'
import { DEFAULT_VIDEO_REASONING_EFFORT, EXTENDED_REASONING_EFFORT_LEVELS } from '../constants.js'

const VIDEO_PROVIDER_KEY = 'video_provider'
const VIDEO_MODEL_KEY = 'video_model'
const VIDEO_EFFORT_KEY = 'video_effort'
const MODEL_MAX_LENGTH = 100
const WHITESPACE_RE = /\s/
const CACHE_TTL_MS = 60_000

let snapshot = null

function toStoredValue(stored) {
  return typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : null
}

async function readSettings() {
  if (snapshot && snapshot.expiresAt > Date.now()) return snapshot.settings

  const [provider, model, effort] = await Promise.all([
    getConfigValue(VIDEO_PROVIDER_KEY),
    getConfigValue(VIDEO_MODEL_KEY),
    getConfigValue(VIDEO_EFFORT_KEY),
  ])
  const settings = { provider: toStoredValue(provider), model: toStoredValue(model), effort: toStoredValue(effort) }
  snapshot = { settings, expiresAt: Date.now() + CACHE_TTL_MS }

  return settings
}

async function saveValue(key, value) {
  await setConfigValue(key, value)
  snapshot = null
}

async function resolveProvider(stored) {
  if (isKnownProvider(stored)) return stored

  const active = await getLlmProvider()
  return isKnownProvider(active) ? active : DEFAULT_PROVIDER
}

function resolveEffort(stored) {
  return EXTENDED_REASONING_EFFORT_LEVELS.includes(stored) ? stored : DEFAULT_VIDEO_REASONING_EFFORT
}

export function parseVideoProvider(value) {
  if (!isKnownProvider(value)) return { error: 'That is not a supported LLM provider.' }

  return { value }
}

export function parseVideoModel(value) {
  if (typeof value !== 'string') return { error: 'The model must be a string (empty to use the LLM section model).' }

  const model = value.trim()
  if (model.length > MODEL_MAX_LENGTH || WHITESPACE_RE.test(model)) {
    return { error: `The model must be a single id without spaces, up to ${MODEL_MAX_LENGTH} characters.` }
  }

  return { value: model }
}

export function parseVideoEffort(value) {
  if (!EXTENDED_REASONING_EFFORT_LEVELS.includes(value)) return { error: 'That is not a supported reasoning effort.' }

  return { value }
}

export async function getVideoModel() {
  return (await readSettings()).model
}

export async function getVideoModelSelection() {
  const stored = await readSettings()
  const provider = await resolveProvider(stored.provider)
  const model = stored.model ?? (await getProviderModel(provider))

  return { provider, model, effort: resolveEffort(stored.effort) }
}

export async function isVideoConfigured() {
  const { provider, model } = await getVideoModelSelection()

  return isProviderConfigured(provider, { model })
}

export async function setVideoProvider(provider) {
  await saveValue(VIDEO_PROVIDER_KEY, provider)
}

export async function setVideoModel(model) {
  await saveValue(VIDEO_MODEL_KEY, model)
}

export async function setVideoEffort(effort) {
  await saveValue(VIDEO_EFFORT_KEY, effort)
}

export function _resetVideoSettingsCacheForTests() {
  snapshot = null
}
