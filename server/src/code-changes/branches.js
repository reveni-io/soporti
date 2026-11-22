import { randomInt } from 'node:crypto'

const BRANCH_PREFIX = 'soporti/'
const SUFFIX_LENGTH = 6
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const MAX_SLUG_LENGTH = 40
const FALLBACK_SLUG = 'change'
const DIACRITICS_RE = /[̀-ͯ]/g
const NON_SLUG_RE = /[^a-z0-9]+/g
const EDGE_DASHES_RE = /^-+|-+$/g

export function isSoportiBranch(branch) {
  return typeof branch === 'string' && branch.startsWith(BRANCH_PREFIX) && branch.length > BRANCH_PREFIX.length
}

function slugify(title) {
  const slug = title
    .normalize('NFKD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(NON_SLUG_RE, '-')
    .replace(EDGE_DASHES_RE, '')

  return slug.slice(0, MAX_SLUG_LENGTH).replace(EDGE_DASHES_RE, '') || FALLBACK_SLUG
}

function randomSuffix() {
  return Array.from({ length: SUFFIX_LENGTH }, () => SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)]).join('')
}

export function buildBranchName(title) {
  return `${BRANCH_PREFIX}${slugify(title)}-${randomSuffix()}`
}

export function assertPushableBranch(branch, baseBranch) {
  if (isSoportiBranch(branch) && branch !== baseBranch) return

  throw new Error(
    `Refusing to push to "${branch}": Soporti only pushes to its own ${BRANCH_PREFIX} branches, never to the default branch.`
  )
}
