import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  absoluteApiUrl,
  createAdminUser,
  createSchedule,
  createShare,
  createSkill,
  deleteConversation,
  deleteSchedule,
  deleteSkill,
  decideOAuthAuthorization,
  draftShopifyTokenQuery,
  getAdminStatus,
  getAuthConfig,
  getAuthMethods,
  getConversation,
  getRepos,
  getSchedules,
  getSharedConversation,
  getSkill,
  getSkills,
  isUnauthorized,
  renderMermaid,
  saveDatabaseMaxRows,
  saveGithubToken,
  saveSlackCredential,
  saveUserInstructions,
  sendFeedback,
  signInWithGoogle,
  signInWithPassword,
  streamChat,
  updateSkill,
} from './services.js'

const ORIGINAL_BASE = import.meta.env.VITE_API_URL

function ok(body = {}) {
  return { ok: true, status: 200, json: async () => body }
}

function fail(status, body = {}) {
  return { ok: false, status, json: async () => body }
}

function lastCall() {
  return global.fetch.mock.calls[global.fetch.mock.calls.length - 1]
}

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue(ok())
})

afterEach(() => {
  import.meta.env.VITE_API_URL = ORIGINAL_BASE
})

describe('base url', () => {
  it('requests a relative path when no base url is configured', async () => {
    import.meta.env.VITE_API_URL = ''

    await getSkills('tok')

    expect(lastCall()[0]).toBe('/api/skills')
  })

  it('prefixes the configured base url', async () => {
    import.meta.env.VITE_API_URL = 'https://api.example.com'

    await getSkills('tok')

    expect(lastCall()[0]).toBe('https://api.example.com/api/skills')
  })

  it('falls back to the page origin only for absolute urls', () => {
    import.meta.env.VITE_API_URL = ''
    expect(absoluteApiUrl('/api/webhooks/github')).toBe(`${window.location.origin}/api/webhooks/github`)

    import.meta.env.VITE_API_URL = 'https://api.example.com'
    expect(absoluteApiUrl('/api/webhooks/github')).toBe('https://api.example.com/api/webhooks/github')
  })
})

describe('request', () => {
  it('sends the bearer token and no body on reads', async () => {
    await getSkills('tok')

    const [url, options] = lastCall()
    expect(url).toBe('/api/skills')
    expect(options.method).toBe('GET')
    expect(options.headers).toEqual({ Authorization: 'Bearer tok' })
    expect(options.body).toBeUndefined()
  })

  it('omits the authorization header on public endpoints', async () => {
    await getAuthMethods()

    const [url, options] = lastCall()
    expect(url).toBe('/api/auth/methods')
    expect(options.headers).toEqual({})
  })

  it('serializes the body and sets the json content type on writes', async () => {
    await createSkill('tok', { name: 'qa', description: '', instructions: 'do it' })

    const [url, options] = lastCall()
    expect(url).toBe('/api/skills')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ name: 'qa', description: '', instructions: 'do it' })
  })

  it('returns the parsed json payload', async () => {
    global.fetch = vi.fn().mockResolvedValue(ok({ skills: [{ id: 1 }] }))

    await expect(getSkills('tok')).resolves.toEqual({ skills: [{ id: 1 }] })
  })

  it('resolves to an empty object when the response has no json body', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 })

    await expect(deleteConversation('tok', 'c1')).resolves.toEqual({})
  })

  it('throws an ApiError carrying the status', async () => {
    global.fetch = vi.fn().mockResolvedValue(fail(401))

    const error = await getSkills('tok').catch(err => err)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(401)
    expect(isUnauthorized(error)).toBe(true)
  })

  it('prefers the server error message over the fallback', async () => {
    global.fetch = vi.fn().mockResolvedValue(fail(409, { error: 'A skill with that name already exists' }))

    await expect(createSkill('tok', {})).rejects.toThrow('A skill with that name already exists')
  })

  it('falls back to the per-call message when the error body is empty', async () => {
    global.fetch = vi.fn().mockResolvedValue(fail(500))

    await expect(getSkills('tok')).rejects.toThrow('Failed to load skills')
  })

  it('falls back to the status when there is no per-call message', async () => {
    global.fetch = vi.fn().mockResolvedValue(fail(503))

    await expect(getConversation('tok', 'c1')).rejects.toThrow('HTTP 503')
  })

  it('propagates network failures untouched', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(getSkills('tok')).rejects.toThrow('Failed to fetch')
  })
})

describe('isUnauthorized', () => {
  it('is false for any other error', () => {
    expect(isUnauthorized(new ApiError('nope', 403))).toBe(false)
    expect(isUnauthorized(new Error('boom'))).toBe(false)
    expect(isUnauthorized(null)).toBe(false)
  })
})

describe('streamChat', () => {
  it('returns the raw response so the caller can read the stream', async () => {
    const response = { ok: true, status: 200, body: { getReader: () => 'reader' } }
    global.fetch = vi.fn().mockResolvedValue(response)
    const signal = new AbortController().signal

    await expect(streamChat('tok', { message: 'hi', skillIds: [5] }, signal)).resolves.toBe(response)

    const [url, options] = lastCall()
    expect(url).toBe('/api/chat')
    expect(options.method).toBe('POST')
    expect(options.signal).toBe(signal)
    expect(JSON.parse(options.body)).toEqual({ message: 'hi', skillIds: [5] })
  })

  it('throws an ApiError with the status when the stream cannot start', async () => {
    global.fetch = vi.fn().mockResolvedValue(fail(401))

    const error = await streamChat('tok', {}).catch(err => err)
    expect(error.status).toBe(401)
    expect(error.message).toBe('Server error')
  })
})

describe('endpoints', () => {
  it('signs in with a google credential', async () => {
    await signInWithGoogle('the-credential')

    const [url, options] = lastCall()
    expect(url).toBe('/api/auth/google')
    expect(JSON.parse(options.body)).toEqual({ credential: 'the-credential' })
  })

  it('signs in with an email and password', async () => {
    await signInWithPassword('sam@example.com', 'secret123')

    const [url, options] = lastCall()
    expect(url).toBe('/api/auth/login')
    expect(JSON.parse(options.body)).toEqual({ email: 'sam@example.com', password: 'secret123' })
  })

  it('reads the admin status without a token', async () => {
    await getAdminStatus()

    const [url, options] = lastCall()
    expect(url).toBe('/api/admin/status')
    expect(options.headers).toEqual({})
  })

  it('creates a user from the admin panel', async () => {
    await createAdminUser('tok', { email: 'a@b.com', password: 'pw', role: 'user' })

    const [url, options] = lastCall()
    expect(url).toBe('/api/admin/users')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ email: 'a@b.com', password: 'pw', role: 'user' })
  })

  it('reads the repositories', async () => {
    await getRepos('tok')
    expect(lastCall()[0]).toBe('/api/repos')
  })

  it('deletes a conversation', async () => {
    await deleteConversation('tok', 'c-1')

    const [url, options] = lastCall()
    expect(url).toBe('/api/conversations/c-1')
    expect(options.method).toBe('DELETE')
  })

  it('creates a share for a conversation', async () => {
    await createShare('tok', 'c-1')

    const [url, options] = lastCall()
    expect(url).toBe('/api/share')
    expect(JSON.parse(options.body)).toEqual({ conversationId: 'c-1' })
  })

  it('reads a shared conversation without a token', async () => {
    await getSharedConversation('abc123')

    const [url, options] = lastCall()
    expect(url).toBe('/api/share/abc123')
    expect(options.headers).toEqual({})
  })

  it('sends feedback for a message', async () => {
    await sendFeedback('tok', 'fb-1', false)

    const [url, options] = lastCall()
    expect(url).toBe('/api/feedback')
    expect(JSON.parse(options.body)).toEqual({ feedbackId: 'fb-1', useful: false })
  })

  it('renders a mermaid diagram', async () => {
    await renderMermaid('tok', 'flowchart TD')

    const [url, options] = lastCall()
    expect(url).toBe('/api/mermaid/render')
    expect(JSON.parse(options.body)).toEqual({ chart: 'flowchart TD' })
  })

  it('saves the custom instructions', async () => {
    await saveUserInstructions('tok', 'be brief')

    const [url, options] = lastCall()
    expect(url).toBe('/api/user/instructions')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ instructions: 'be brief' })
  })

  it('decides an OAuth authorization with the session token', async () => {
    await decideOAuthAuthorization('tok', { decision: 'allow', client_id: 'cid' })

    const [url, options] = lastCall()
    expect(url).toBe('/api/oauth/authorize')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(options.body)).toEqual({ decision: 'allow', client_id: 'cid' })
  })

  it('reads a single skill', async () => {
    await getSkill('tok', 7)
    expect(lastCall()[0]).toBe('/api/skills/7')
  })

  it('updates a skill', async () => {
    await updateSkill('tok', 7, { name: 'qa' })

    const [url, options] = lastCall()
    expect(url).toBe('/api/skills/7')
    expect(options.method).toBe('PUT')
  })

  it('deletes a skill', async () => {
    await deleteSkill('tok', 7)

    const [url, options] = lastCall()
    expect(url).toBe('/api/skills/7')
    expect(options.method).toBe('DELETE')
  })

  it('reads the authentication settings', async () => {
    await getAuthConfig('tok')
    expect(lastCall()[0]).toBe('/api/admin/config/auth')
  })

  it('saves the github token under the token key', async () => {
    await saveGithubToken('tok', 'ghp_new')

    const [url, options] = lastCall()
    expect(url).toBe('/api/admin/config/github/token')
    expect(JSON.parse(options.body)).toEqual({ token: 'ghp_new' })
  })

  it('saves the query row limit', async () => {
    await saveDatabaseMaxRows('tok', 250)

    const [url, options] = lastCall()
    expect(url).toBe('/api/admin/config/postgres/max-rows')
    expect(JSON.parse(options.body)).toEqual({ maxRows: 250 })
  })

  it('drafts the shopify token query without a body', async () => {
    await draftShopifyTokenQuery('tok')

    const [url, options] = lastCall()
    expect(url).toBe('/api/admin/config/shopify/draft-token-query')
    expect(options.method).toBe('POST')
    expect(options.body).toBeUndefined()
    expect(options.headers['Content-Type']).toBeUndefined()
  })

  it('reads the scheduled queries', async () => {
    await getSchedules('tok')

    const [url, options] = lastCall()
    expect(url).toBe('/api/schedules')
    expect(options.headers.Authorization).toBe('Bearer tok')
  })

  it('creates a scheduled query', async () => {
    await createSchedule('tok', { question: 'Failed payments?', frequency: 'daily', hour: 9, minute: 0 })

    const [url, options] = lastCall()
    expect(url).toBe('/api/schedules')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      question: 'Failed payments?',
      frequency: 'daily',
      hour: 9,
      minute: 0,
    })
  })

  it('deletes a scheduled query', async () => {
    await deleteSchedule('tok', 3)

    const [url, options] = lastCall()
    expect(url).toBe('/api/schedules/3')
    expect(options.method).toBe('DELETE')
  })

  it('saves a slack credential under its own endpoint and body key', async () => {
    await saveSlackCredential('tok', { endpoint: 'app-token', bodyKey: 'token', value: 'xapp-1' })

    const [url, options] = lastCall()
    expect(url).toBe('/api/admin/config/slack/app-token')
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ token: 'xapp-1' })
  })
})
