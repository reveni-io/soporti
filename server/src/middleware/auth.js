import jwt from 'jsonwebtoken'
import config from '../config.js'
import { hashApiKey, isApiKeyToken } from '../auth/api-key.js'
import { MCP_ENDPOINT_PATH, OAUTH_AUTHORIZE_PATH, OAUTH_REGISTER_PATH, OAUTH_TOKEN_PATH } from '../constants.js'
import { findActiveApiKeyByHash, touchApiKeyLastUsed } from '../db/api-keys.js'
import { findUserById } from '../db/users.js'
import { protectedResourceMetadataUrl } from '../oauth/metadata.js'
import { verifyAccessToken } from '../oauth/tokens.js'

export function createSession(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role ?? 'user' }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  })
}

export function getSessionUser(token) {
  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] })
    if (!payload.id) return null

    return { id: payload.id, email: payload.email, name: payload.name, role: payload.role ?? 'user' }
  } catch {
    return null
  }
}

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/auth/google' },
  { method: 'POST', path: '/api/auth/login' },
  { method: 'GET', path: '/api/auth/methods' },
  { method: 'GET', path: '/api/health' },
  { method: 'GET', path: '/api/admin/status' },
  { method: 'POST', path: '/api/admin/bootstrap' },
  { method: 'GET', path: OAUTH_AUTHORIZE_PATH },
  { method: 'POST', path: OAUTH_REGISTER_PATH },
  { method: 'POST', path: OAUTH_TOKEN_PATH },
]

function unauthorized(req, res, error) {
  if (req.path === MCP_ENDPOINT_PATH) {
    res.set('WWW-Authenticate', `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`)
  }

  return res.status(401).json({ error })
}

async function resolveApiKey(token) {
  const row = await findActiveApiKeyByHash(hashApiKey(token))
  if (!row) return null

  await touchApiKeyLastUsed(row.id)

  return {
    user: { id: row.userId, email: row.email, name: row.name, role: row.role ?? 'user' },
    apiKey: { id: row.id, sources: Array.isArray(row.sources) ? row.sources : [] },
  }
}

async function resolveAccessToken(userId) {
  const owner = await findUserById(userId)
  if (!owner) return null

  return { user: { id: owner.id, email: owner.email, name: owner.name, role: owner.role ?? 'user' } }
}

export async function requireAuth(req, res, next) {
  if (PUBLIC_ROUTES.some(route => route.method === req.method && route.path === req.path)) {
    return next()
  }
  if (req.method === 'GET' && req.path.startsWith('/api/share/')) {
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(req, res, 'Authentication required.')
  }

  const token = authHeader.slice(7)

  if (isApiKeyToken(token)) {
    try {
      const resolved = await resolveApiKey(token)
      if (!resolved) return unauthorized(req, res, 'Invalid or revoked API key.')

      req.user = resolved.user
      req.apiKey = resolved.apiKey
      return next()
    } catch (err) {
      return next(err)
    }
  }

  const accessToken = verifyAccessToken(token)

  if (accessToken) {
    if (req.path !== MCP_ENDPOINT_PATH) {
      return unauthorized(req, res, 'This access token is only valid for the MCP endpoint.')
    }

    try {
      const resolved = await resolveAccessToken(accessToken.userId)
      if (!resolved) return unauthorized(req, res, 'The account behind this access token no longer exists.')

      req.user = resolved.user
      return next()
    } catch (err) {
      return next(err)
    }
  }

  const user = getSessionUser(token)

  if (!user) {
    return unauthorized(req, res, 'Invalid or expired token.')
  }

  req.user = user
  next()
}

export async function requireAdmin(req, res, next) {
  try {
    const user = req.user ? await findUserById(req.user.id) : null
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' })
    }
    next()
  } catch (err) {
    next(err)
  }
}
