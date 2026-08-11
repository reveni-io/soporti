import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import config from '../config.js'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

function parseTrustProxy(value) {
  if (value === 'false') return false
  if (/^\d+$/.test(value)) return parseInt(value, 10)
  return value
}

function isAllowedOrigin(origin, allowedOrigins) {
  if (allowedOrigins.includes(origin)) return true

  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname)
  } catch {
    return false
  }
}

export function mcpOriginGuard(req, res, next) {
  const origin = req.headers.origin

  if (!origin) return next()
  if (isAllowedOrigin(origin, config.security.corsOrigins)) return next()

  res.status(403).json({ error: 'Origin not allowed.' })
}

export function setupSecurity(app) {
  app.set('trust proxy', parseTrustProxy(config.security.trustProxy))

  app.use(helmet())

  if (config.security.corsOrigins.length === 0 && process.env.NODE_ENV === 'production') {
    console.warn(
      '[security] CORS_ORIGIN is not set: the API accepts requests from any browser origin. ' +
        'This is fine when the client is served from the same origin (e.g. docker-compose.prod.yml); ' +
        'set CORS_ORIGIN to the client origin when the frontend lives on a different domain.'
    )
  }

  app.use(
    cors({
      origin: config.security.corsOrigins.length > 0 ? config.security.corsOrigins : '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'MCP-Protocol-Version', 'Mcp-Method', 'Mcp-Name'],
      maxAge: 3600,
    })
  )

  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a moment.' },
  })

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a moment.' },
  })

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  })

  const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a moment.' },
  })

  app.use('/api/chat', chatLimiter)
  app.use('/api/auth/login', authLimiter)
  app.use('/api/admin/bootstrap', authLimiter)
  app.use('/api/mcp', mcpOriginGuard, mcpLimiter)
  app.use('/api/', generalLimiter)

  app.disable('x-powered-by')
}
