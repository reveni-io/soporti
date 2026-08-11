import { Router } from 'express'
import { isSourceList } from '../agent/sources.js'
import { generateApiKey } from '../auth/api-key.js'
import { MAX_API_KEY_NAME_LENGTH, MAX_API_KEYS_PER_USER, MAX_SOURCES } from '../constants.js'
import { countApiKeys, createApiKey, listApiKeys, revokeApiKey } from '../db/api-keys.js'

const router = Router()

const ID_RE = /^\d{1,9}$/

function parseApiKeyInput(body) {
  const { name, sources } = body ?? {}

  const trimmedName = typeof name === 'string' ? name.trim() : ''
  if (!trimmedName) return { error: 'Name is required.' }
  if (trimmedName.length > MAX_API_KEY_NAME_LENGTH) {
    return { error: `Name is too long (max ${MAX_API_KEY_NAME_LENGTH} characters).` }
  }
  if (sources != null && !isSourceList(sources)) {
    return { error: `Sources must be an array of up to ${MAX_SOURCES} source names.` }
  }

  return { value: { name: trimmedName, sources: sources ?? [] } }
}

router.use((req, res, next) => {
  if (req.apiKey) return res.status(403).json({ error: 'API keys cannot manage API keys.' })
  next()
})

router.get('/', async (req, res) => {
  try {
    res.json({ apiKeys: await listApiKeys(req.user.id) })
  } catch (err) {
    console.error('Failed to list API keys:', err)
    res.status(500).json({ error: 'Failed to list API keys.' })
  }
})

router.post('/', async (req, res) => {
  const { error, value } = parseApiKeyInput(req.body)
  if (error) return res.status(400).json({ error })

  try {
    if ((await countApiKeys(req.user.id)) >= MAX_API_KEYS_PER_USER) {
      return res.status(422).json({ error: `You can only have ${MAX_API_KEYS_PER_USER} API keys.` })
    }

    const { key, prefix, keyHash } = generateApiKey()
    const apiKey = await createApiKey(req.user.id, { ...value, prefix, keyHash })

    res.status(201).json({ apiKey, key })
  } catch (err) {
    console.error('Failed to create the API key:', err)
    res.status(500).json({ error: 'Failed to create the API key.' })
  }
})

router.delete('/:id', async (req, res) => {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid API key ID.' })

  try {
    const revoked = await revokeApiKey(Number(req.params.id), req.user.id)
    if (!revoked) return res.status(404).json({ error: 'API key not found.' })

    res.json({ ok: true })
  } catch (err) {
    console.error('Failed to revoke the API key:', err)
    res.status(500).json({ error: 'Failed to revoke the API key.' })
  }
})

export default router
