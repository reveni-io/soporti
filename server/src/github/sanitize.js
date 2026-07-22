export const BLOCKED_PATHS = ['.git', '.env', '.env.local', '.env.production', 'node_modules', '.aws', '.ssh']

export function parseRepo(fullName) {
  const parts = fullName.split('/')
  if (parts.length !== 2) {
    throw new Error(`Invalid repository format: "${fullName}". Expected "owner/repo".`)
  }
  return { owner: parts[0], repo: parts[1] }
}

export function sanitizePath(p) {
  if (!p) return ''

  let decoded
  try {
    decoded = decodeURIComponent(p)
  } catch {
    throw new Error('Invalid path encoding.')
  }

  if (decoded.includes('\0')) {
    throw new Error('Invalid path.')
  }

  const cleaned = decoded.replace(/^\/+/, '')
  const segments = cleaned.split('/')

  for (const segment of segments) {
    if (segment === '..' || segment === '.') {
      throw new Error('Path traversal is not allowed.')
    }
    if (BLOCKED_PATHS.includes(segment)) {
      throw new Error(`Access to "${segment}" is not allowed.`)
    }
  }

  return cleaned
}
