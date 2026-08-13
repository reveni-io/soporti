import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../../hooks/useAuth/useAuth.js'
import { decideOAuthAuthorization, isUnauthorized } from '../../../../services/services.js'

const REQUIRED_PARAMS = ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method']
const OPTIONAL_PARAMS = ['scope', 'resource', 'state']
const ALLOW_DECISION = 'allow'
const DENY_DECISION = 'deny'
const UNNAMED_CLIENT = 'An MCP client'

export function useOAuthConsent() {
  const [searchParams] = useSearchParams()
  const { token, logout } = useAuth()
  const [error, setError] = useState(null)
  const [isDeciding, setIsDeciding] = useState(false)

  const isRequestValid = REQUIRED_PARAMS.every(name => searchParams.get(name))

  async function decide(decision) {
    const authorization = { decision }
    for (const name of [...REQUIRED_PARAMS, ...OPTIONAL_PARAMS]) {
      const value = searchParams.get(name)
      if (value !== null) authorization[name] = value
    }

    setError(null)
    setIsDeciding(true)

    try {
      const { redirectTo } = await decideOAuthAuthorization(token, authorization)
      window.location.href = redirectTo
    } catch (err) {
      if (isUnauthorized(err)) {
        logout()
        return
      }
      setError(err.message)
    } finally {
      setIsDeciding(false)
    }
  }

  return {
    clientName: searchParams.get('client_name') || UNNAMED_CLIENT,
    isRequestValid,
    error,
    isDeciding,
    approve: () => decide(ALLOW_DECISION),
    deny: () => decide(DENY_DECISION),
  }
}
