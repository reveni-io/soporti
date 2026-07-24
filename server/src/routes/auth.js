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

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}

  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }

  if (email.length > 254 || password.length > 72) {
    return res.status(401).json({ error: 'Invalid email or password.' })
  }

  try {
    const [user, methods] = await Promise.all([findUserByEmail(email), getAuthMethods()])
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
    const methodAllowed = methods.password || user?.role === 'admin'
    if (!user?.passwordHash || !passwordMatches || !methodAllowed) {
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

router.get('/methods', async (_req, res) => {
  try {
    const [methods, googleClientId] = await Promise.all([getAuthMethods(), getGoogleClientId()])
    res.json({ google: methods.google && Boolean(googleClientId), password: methods.password })
  } catch (err) {
    console.error('Auth methods error:', err)
    res.status(500).json({ error: 'Failed to read the sign-in methods.' })
  }
})

export default router
