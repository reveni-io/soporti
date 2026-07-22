import { Router } from 'express'
import { verifyGoogleCredential } from '../auth/google.js'
import { verifyPassword, DUMMY_HASH } from '../auth/password.js'
import { getAuthMethods } from '../auth/auth-methods.js'
import { getGoogleClientId } from '../auth/google-settings.js'
import { upsertGoogleUser, findUserByEmail, touchLastLogin } from '../db/users.js'
import { createSession } from '../middleware/auth.js'

const router = Router()

function publicUser(user) {
  return { email: user.email, name: user.name, picture: user.picture, role: user.role }
}

// POST /api/auth/google — exchanges a Google ID token for an app session token.
router.post('/google', async (req, res) => {
  const { credential } = req.body ?? {}

  if (!credential || typeof credential !== 'string') {
    return res.status(400).json({ error: 'A Google "credential" is required.' })
  }

  let profile
  try {
    profile = await verifyGoogleCredential(credential)
  } catch (err) {
    if (err.code === 'DOMAIN_NOT_ALLOWED') {
      return res.status(403).json({ error: err.message })
    }
    console.error('Google auth error:', err.message)
    return res.status(401).json({ error: 'Invalid Google credential.' })
  }

  try {
    const user = await upsertGoogleUser(profile)
    const token = createSession(user)
    res.json({ token, user: publicUser(user) })
  } catch (err) {
    console.error('Login persistence error:', err)
    res.status(500).json({ error: 'Failed to complete login.' })
  }
})

// POST /api/auth/login — email + password login for admin-created accounts.
// Rate-limited in middleware/security.js.
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}

  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }

  // No stored credential can match these (emails are capped by the RFC,
  // passwords by bcrypt's 72-byte input), so reject early without hashing.
  if (email.length > 254 || password.length > 72) {
    return res.status(401).json({ error: 'Invalid email or password.' })
  }

  try {
    const [user, methods] = await Promise.all([findUserByEmail(email), getAuthMethods()])
    // Always run exactly one bcrypt compare (against a dummy hash when the
    // account doesn't exist or has no password) so response timing doesn't
    // reveal which emails are registered.
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
    // The password toggle gates regular users only: admins can always sign in
    // with their password, otherwise disabling it would lock them out of /admin.
    const methodAllowed = methods.password || user?.role === 'admin'
    if (!user?.passwordHash || !passwordMatches || !methodAllowed) {
      // One generic message for unknown email / wrong password / Google-only
      // account / disabled method: no account enumeration.
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    await touchLastLogin(user.id)
    const token = createSession(user)
    res.json({ token, user: publicUser(user) })
  } catch (err) {
    console.error('Password login error:', err)
    res.status(500).json({ error: 'Failed to complete login.' })
  }
})

// GET /api/auth/methods — which sign-in methods are enabled. Public: the
// /login page uses it to decide what to render (the server enforces it too).
router.get('/methods', async (_req, res) => {
  try {
    const [methods, googleClientId] = await Promise.all([getAuthMethods(), getGoogleClientId()])
    // Google needs both the toggle AND a configured client id to work, so don't
    // advertise it (and render a broken button) until the id is set.
    res.json({ google: methods.google && Boolean(googleClientId), password: methods.password })
  } catch (err) {
    console.error('Auth methods error:', err)
    res.status(500).json({ error: 'Failed to read the sign-in methods.' })
  }
})

export default router
