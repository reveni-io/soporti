import { getConfigValue, setConfigValue } from '../db/app-config.js'

export const MAIN_AGENT_TOOLS_KEY = 'main_agent_tools'

const CACHE_TTL_MS = 60_000
const cache = new Map()

export async function getMainAgentTools() {
  const entry = cache.get(MAIN_AGENT_TOOLS_KEY)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }

  const stored = await getConfigValue(MAIN_AGENT_TOOLS_KEY)
  const value = Array.isArray(stored) ? stored.filter(name => typeof name === 'string') : null
  cache.set(MAIN_AGENT_TOOLS_KEY, { value, expiresAt: Date.now() + CACHE_TTL_MS })

  return value
}

export async function setMainAgentTools(tools) {
  await setConfigValue(MAIN_AGENT_TOOLS_KEY, tools)
  cache.delete(MAIN_AGENT_TOOLS_KEY)
}

export function _resetAgentSettingsCacheForTests() {
  cache.clear()
}
