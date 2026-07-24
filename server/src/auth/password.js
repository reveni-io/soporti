import bcrypt from 'bcryptjs'

const COST = 12

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72

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

export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', COST)
