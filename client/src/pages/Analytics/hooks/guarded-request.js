import { isUnauthorized } from '../../../services/services.js'

export async function sendGuarded(request, onLogout) {
  try {
    return await request()
  } catch (err) {
    if (!isUnauthorized(err)) throw err

    onLogout?.()
    return null
  }
}
