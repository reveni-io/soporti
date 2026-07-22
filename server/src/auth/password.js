import bcrypt from 'bcryptjs'

// bcryptjs (pure JS) over native bcrypt: no build toolchain needed, which
// matters for self-hosters on alpine/ARM Docker images. Logins are rare so
// the speed difference is irrelevant.
const COST = 12

// bcrypt silently truncates inputs beyond 72 bytes, so we reject instead.
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72

// Returns null when valid, or a human-readable error message.
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`
  }
  return null
}

export function hashPassword(password) {
  return bcrypt.hash(password, COST)
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash)
}

// Compared against when the email doesn't exist, so login response timing
// doesn't reveal which emails are registered.
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', COST)
