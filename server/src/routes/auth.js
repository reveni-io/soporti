import { Router } from 'express'
import { exchangeGoogleCode, GOOGLE_SIGN_IN_REJECTED, verifyGoogleCredential } from '../auth/google.js'
import { verifyPassword, DUMMY_HASH } from '../auth/password.js'
import { getAuthMethods } from '../auth/auth-methods.js'
import { getGoogleClientId, getGoogleClientSecret } from '../auth/google-settings.js'
import { upsertGoogleUser, findUserByEmail, findUserById, touchLastLogin } from '../db/users.js'
import { createSession } from '../middleware/auth.js'
import { grantsWorkspaceAccess, removeGoogleConnection, saveGoogleConnection } from '../google-workspace/settings.js'
import { GOOGLE_WORKSPACE_SCOPES, MAX_GOOGLE_CODE_LENGTH } from '../constants.js'

const router = Router()

function publicUser(user) {
  return { email: user.email, name: user.name, picture: user.picture, role: user.role }
}

function parseGoogleCode(code) {
  if (typeof code !== 'string' || !code || code.length > MAX_GOOGLE_CODE_LENGTH) {
    return { error: 'A Google authorization "code" is required.' }
  }

  return { value: code }
}

function rejectGoogleSignIn(res, err, message) {
  if (err.code === GOOGLE_SIGN_IN_REJECTED) return res.status(403).json({ error: err.message })

  console.error('Google auth error:', err.message)
  return res.status(401).json({ error: message })
}

async function syncGoogleConnection(userId, email, tokens) {
  if (grantsWorkspaceAccess(tokens.scopes)) {
    await saveGoogleConnection(userId, { email, ...tokens })
    return
  }

  await removeGoogleConnection(userId)
}

async function storeGoogleConnection(userId, email, tokens) {
  if (!tokens?.refreshToken) return

  try {
    await syncGoogleConnection(userId, email, tokens)
  } catch (err) {
    console.error('Failed to store the Google connection:', err.cause?.message ?? err.message)
  }
}

async function respondWithGoogleSession(res, { profile, tokens }) {
  try {
    const user = await upsertGoogleUser(profile)
    await storeGoogleConnection(user.id, profile.email, tokens)
    res.json({ token: createSession(user), user: publicUser(user) })
  } catch (err) {
    console.error('Login persistence error:', err)
    res.status(500).json({ error: 'Failed to complete login.' })
  }
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
    return rejectGoogleSignIn(res, err, 'Invalid Google credential.')
  }

  await respondWithGoogleSession(res, { profile })
})

router.post('/google/code', async (req, res) => {
  const { error, value: code } = parseGoogleCode(req.body?.code)
  if (error) return res.status(400).json({ error })

  let exchange
  try {
    exchange = await exchangeGoogleCode(code)
  } catch (err) {
    return rejectGoogleSignIn(res, err, 'Invalid Google authorization code.')
  }

  await respondWithGoogleSession(res, exchange)
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

router.post('/refresh', async (req, res) => {
  if (req.apiKey) return res.status(403).json({ error: 'API keys cannot refresh a session.' })

  try {
    const user = await findUserById(req.user.id)

    if (!user) return res.status(401).json({ error: 'The account behind this session no longer exists.' })

    res.json({ token: createSession(user), user: publicUser(user) })
  } catch (err) {
    console.error('Failed to refresh the session:', err)
    res.status(500).json({ error: 'Failed to refresh the session.' })
  }
})

router.get('/methods', async (_req, res) => {
  try {
    const [methods, googleClientId, googleClientSecret] = await Promise.all([
      getAuthMethods(),
      getGoogleClientId(),
      getGoogleClientSecret(),
    ])
    const google = methods.google && Boolean(googleClientId)

    res.json({
      google,
      password: methods.password,
      googleScopes: google && googleClientSecret ? GOOGLE_WORKSPACE_SCOPES : null,
    })
  } catch (err) {
    console.error('Auth methods error:', err)
    res.status(500).json({ error: 'Failed to read the sign-in methods.' })
  }
})

export default router
