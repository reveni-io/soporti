import { getShortcutToken, isShortcutConfigured } from './settings.js'

const BASE_URL = 'https://api.app.shortcut.com/api/v3'

async function request(method, path, body) {
  const token = await getShortcutToken()
  if (!token) {
    throw new Error('Shortcut token not configured. Set it in the admin panel (Shortcut section).')
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Shortcut-Token': token,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shortcut API ${method} ${path} failed (${res.status}): ${text}`)
  }

  return res.json()
}

export async function getStory(id) {
  const story = await request('GET', `/stories/${id}`)

  return {
    id: story.id,
    name: story.name,
    description: story.description || '',
    story_type: story.story_type,
    workflow_state_id: story.workflow_state_id,
    epic_id: story.epic_id,
    labels: (story.labels || []).map(l => l.name),
    owners: story.owner_ids || [],
    tasks: (story.tasks || []).map(t => ({
      description: t.description,
      complete: t.complete,
    })),
    estimate: story.estimate,
    deadline: story.deadline,
    app_url: story.app_url,
  }
}

export async function searchStories(query) {
  const data = await request('GET', `/search/stories?query=${encodeURIComponent(query)}`)

  return {
    total: data.total || data.data?.length || 0,
    stories: (data.data || []).slice(0, 10).map(s => ({
      id: s.id,
      name: s.name,
      story_type: s.story_type,
      app_url: s.app_url,
    })),
  }
}

export async function isConfigured() {
  return isShortcutConfigured()
}
