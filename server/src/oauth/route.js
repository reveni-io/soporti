import express, { Router } from 'express'
import {
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_CODE_CHALLENGE_METHOD,
  OAUTH_CONSENT_PATH,
  OAUTH_GRANT_AUTHORIZATION_CODE,
  OAUTH_GRANT_REFRESH_TOKEN,
  OAUTH_RESPONSE_TYPE_CODE,
  OAUTH_SCOPE,
} from '../constants.js'
import { getClient, isRegisteredRedirectUri, parseClientRegistration, registerClient } from './clients.js'
import { isValidCodeChallenge, issueAuthorizationCode, redeemAuthorizationCode } from './codes.js'
import { mcpResourceUri } from './metadata.js'
import { issueAccessToken, issueRefreshToken, rotateRefreshToken } from './tokens.js'

const DENY_DECISION = 'deny'

const router = Router()

router.use(express.urlencoded({ extended: false }))

function oauthError(res, status, error, description) {
  return res.status(status).json({ error, error_description: description })
}

function buildRedirect(redirectUri, params) {
  const url = new URL(redirectUri)

  for (const [name, value] of Object.entries(params)) {
    if (value != null) url.searchParams.set(name, value)
  }

  return url.toString()
}

function buildErrorRedirect(params, { code, description }) {
  return buildRedirect(params.redirect_uri, { error: code, error_description: description, state: params.state })
}

async function resolveClient(params) {
  const client = await getClient(params.client_id)
  if (!client) return { error: 'Unknown client_id. Register the client before authorizing.' }
  if (typeof params.redirect_uri !== 'string' || !isRegisteredRedirectUri(client, params.redirect_uri)) {
    return { error: 'The redirect_uri is not registered for this client.' }
  }

  return { value: client }
}

function validateGrantParams(params) {
  if (params.code_challenge_method !== OAUTH_CODE_CHALLENGE_METHOD) {
    return {
      error: {
        code: 'invalid_request',
        description: `code_challenge_method must be ${OAUTH_CODE_CHALLENGE_METHOD}.`,
      },
    }
  }
  if (!isValidCodeChallenge(params.code_challenge)) {
    return { error: { code: 'invalid_request', description: 'code_challenge must be a valid S256 challenge.' } }
  }
  if (params.scope != null && params.scope !== '' && params.scope !== OAUTH_SCOPE) {
    return { error: { code: 'invalid_scope', description: `The only supported scope is "${OAUTH_SCOPE}".` } }
  }
  if (params.resource != null && params.resource !== '' && params.resource !== mcpResourceUri()) {
    return { error: { code: 'invalid_target', description: `The only protected resource is ${mcpResourceUri()}.` } }
  }

  return { value: { codeChallenge: params.code_challenge, scope: OAUTH_SCOPE, resource: mcpResourceUri() } }
}

router.post('/register', async (req, res) => {
  const { error, value } = parseClientRegistration(req.body)
  if (error) return oauthError(res, 400, 'invalid_client_metadata', error)

  try {
    const client = await registerClient(value)

    res.status(201).json({
      client_id: client.clientId,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      grant_types: [OAUTH_GRANT_AUTHORIZATION_CODE, OAUTH_GRANT_REFRESH_TOKEN],
      response_types: [OAUTH_RESPONSE_TYPE_CODE],
      token_endpoint_auth_method: 'none',
    })
  } catch (err) {
    console.error('Failed to register the OAuth client:', err)
    oauthError(res, 500, 'server_error', 'Failed to register the client.')
  }
})

router.get('/authorize', async (req, res) => {
  try {
    const { error, value: client } = await resolveClient(req.query)
    if (error) return oauthError(res, 400, 'invalid_request', error)

    if (req.query.response_type !== OAUTH_RESPONSE_TYPE_CODE) {
      return res.redirect(
        buildErrorRedirect(req.query, {
          code: 'unsupported_response_type',
          description: `Only the ${OAUTH_RESPONSE_TYPE_CODE} response type is supported.`,
        })
      )
    }

    const grant = validateGrantParams(req.query)
    if (grant.error) return res.redirect(buildErrorRedirect(req.query, grant.error))

    const consent = new URLSearchParams({
      client_id: client.clientId,
      client_name: client.name,
      redirect_uri: req.query.redirect_uri,
      code_challenge: grant.value.codeChallenge,
      code_challenge_method: OAUTH_CODE_CHALLENGE_METHOD,
      scope: grant.value.scope,
      resource: grant.value.resource,
    })
    if (req.query.state) consent.set('state', req.query.state)

    res.redirect(`${OAUTH_CONSENT_PATH}?${consent.toString()}`)
  } catch (err) {
    console.error('Failed to start the OAuth authorization:', err)
    oauthError(res, 500, 'server_error', 'Failed to start the authorization.')
  }
})

router.post('/authorize', async (req, res) => {
  if (req.apiKey) return res.status(403).json({ error: 'API keys cannot authorize OAuth clients.' })

  try {
    const { error, value: client } = await resolveClient(req.body)
    if (error) return oauthError(res, 400, 'invalid_request', error)

    const grant = validateGrantParams(req.body)
    if (grant.error) return oauthError(res, 400, grant.error.code, grant.error.description)

    if (req.body.decision === DENY_DECISION) {
      const redirectTo = buildErrorRedirect(req.body, {
        code: 'access_denied',
        description: 'The user denied the request.',
      })
      return res.json({ redirectTo })
    }

    const code = await issueAuthorizationCode({
      clientId: client.clientId,
      userId: req.user.id,
      redirectUri: req.body.redirect_uri,
      codeChallenge: grant.value.codeChallenge,
      scope: grant.value.scope,
      resource: grant.value.resource,
    })

    res.json({ redirectTo: buildRedirect(req.body.redirect_uri, { code, state: req.body.state }) })
  } catch (err) {
    console.error('Failed to approve the OAuth authorization:', err)
    oauthError(res, 500, 'server_error', 'Failed to approve the authorization.')
  }
})

function respondWithTokens(res, { userId, clientId, scope, refreshToken }) {
  res.set('Cache-Control', 'no-store')
  res.json({
    access_token: issueAccessToken({ userId, clientId, scope }),
    token_type: 'Bearer',
    expires_in: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
  })
}

router.post('/token', async (req, res) => {
  const { grant_type: grantType, client_id: clientId } = req.body ?? {}

  if (grantType !== OAUTH_GRANT_AUTHORIZATION_CODE && grantType !== OAUTH_GRANT_REFRESH_TOKEN) {
    return oauthError(res, 400, 'unsupported_grant_type', 'Supported grants are authorization_code and refresh_token.')
  }

  try {
    const client = await getClient(clientId)
    if (!client) return oauthError(res, 401, 'invalid_client', 'Unknown client_id.')

    if (grantType === OAUTH_GRANT_REFRESH_TOKEN) {
      const rotated = await rotateRefreshToken({ token: req.body.refresh_token, clientId: client.clientId })
      if (rotated.error) return oauthError(res, 400, 'invalid_grant', rotated.error)

      return respondWithTokens(res, { ...rotated.value, clientId: client.clientId })
    }

    const redeemed = await redeemAuthorizationCode({
      code: req.body.code,
      clientId: client.clientId,
      redirectUri: req.body.redirect_uri,
      codeVerifier: req.body.code_verifier,
    })
    if (redeemed.error) return oauthError(res, 400, 'invalid_grant', redeemed.error)

    const refreshToken = await issueRefreshToken({
      clientId: client.clientId,
      userId: redeemed.value.userId,
      scope: redeemed.value.scope,
    })

    respondWithTokens(res, { ...redeemed.value, clientId: client.clientId, refreshToken })
  } catch (err) {
    console.error('Failed to issue an OAuth token:', err)
    oauthError(res, 500, 'server_error', 'Failed to issue the token.')
  }
})

export default router
