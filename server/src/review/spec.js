import * as shortcut from '../shortcut/client.js'

const STORY_REF = /\bsc-?(\d+)\b|app\.shortcut\.com\/[^/\s]+\/story\/(\d+)/gi
const MAX_STORIES = 3

export async function loadSpec(pr, { logger = console } = {}) {
  const ids = extractStoryIds(pr)
  const configured = await shortcut.isConfigured()

  if (!configured) return { configured, stories: ids.map(id => ({ id, story: null })) }

  const stories = await Promise.all(ids.map(id => fetchStory(id, logger)))

  return { configured, stories }
}

function extractStoryIds({ headRef, title, body }) {
  const ids = [headRef, title, body]
    .filter(source => typeof source === 'string')
    .flatMap(source => [...source.matchAll(STORY_REF)])
    .map(match => parseInt(match[1] ?? match[2], 10))

  return [...new Set(ids)].slice(0, MAX_STORIES)
}

async function fetchStory(id, logger) {
  try {
    return { id, story: await shortcut.getStory(id) }
  } catch (err) {
    logger.warn(`[review] Could not load Shortcut story sc-${id} (${err.message}); the reviewer is told to fetch it`)
    return { id, story: null }
  }
}
