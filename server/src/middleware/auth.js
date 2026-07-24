import jwt from 'jsonwebtoken'
import config from '../config.js'
import { findUserById } from '../db/users.js'

export function createSession(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role ?? 'user' }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  })
}

export function getSessionUser(token) {
  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] })
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
]

export function requireAuth(req, res, next) {
  if (PUBLIC_ROUTES.some(route => route.method === req.method && route.path === req.path)) {
    return next()
  }
  if (req.method === 'GET' && req.path.startsWith('/api/share/')) {
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  const token = authHeader.slice(7)
  const user = getSessionUser(token)

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token.' })
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
