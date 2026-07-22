import crypto from 'node:crypto'

// One-time setup code protecting the first-run admin bootstrap. While no
// admin exists, anyone who can reach the server could otherwise claim the
// admin account; requiring a code that is only printed to the server logs
// restricts the bootstrap to the operator (same pattern as Jupyter/Grafana).
// The code lives in memory: a restart simply generates a new one.

let setupCode = null
let announced = false

function getSetupCode() {
  if (!setupCode) {
    setupCode = crypto.randomBytes(16).toString('hex')
  }
  return setupCode
}

// Prints the code to the server logs, once per process.
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

// Test-only: reset the module state between tests.
export function resetSetupCode() {
  setupCode = null
  announced = false
}
