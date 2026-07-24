import crypto from 'node:crypto'

let setupCode = null
let announced = false

function getSetupCode() {
  if (!setupCode) {
    setupCode = crypto.randomBytes(16).toString('hex')
  }
  return setupCode
}

export function announceSetupCode() {
  const code = getSetupCode()
  if (!announced) {
    console.log(`[auth] Admin setup code (asked by the /admin bootstrap form): ${code}`)
    announced = true
  }
}

export function verifySetupCode(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false
  }
  const expected = Buffer.from(getSetupCode())
  const received = Buffer.from(candidate)
  return received.length === expected.length && crypto.timingSafeEqual(expected, received)
}

export function resetSetupCode() {
  setupCode = null
  announced = false
}
