import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import config from '../config.js'

// 'false' disables, a number trusts that many hops, anything else is passed
// through (Express also accepts named presets like 'loopback').
function parseTrustProxy(value) {
  if (value === 'false') return false
  if (/^\d+$/.test(value)) return parseInt(value, 10)
  return value
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
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 3600,
    })
  )

  // No custom keyGenerator: express-rate-limit's default already keys on the
  // client IP and normalizes IPv6 (incl. IPv4-mapped addresses), which is the
  // per-client bypass the library's own CVE fix hardened.
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

  // Credential endpoints get a strict limiter: password login and the
  // first-run admin bootstrap are the two brute-forceable surfaces.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again later.' },
  })

  app.use('/api/chat', chatLimiter)
  app.use('/api/auth/login', authLimiter)
  app.use('/api/admin/bootstrap', authLimiter)
  app.use('/api/', generalLimiter)

  app.disable('x-powered-by')
}
