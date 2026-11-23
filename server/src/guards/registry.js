import { JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT } from '../constants.js'
import { listJevDocuments } from '../db/jev-documents.js'
import { isGuardId } from '../jev/documents.js'
import { isConfigured } from '../jev/settings.js'

const LEGACY_NAMES = new Map([
  [JEV_LEGAL_DOCUMENT, 'Legal'],
  [JEV_GITHUB_DOCUMENT, 'GitHub PRs'],
])

function toGuard({ id, data, setVersion }) {
  return {
    id,
    name: data.name || LEGACY_NAMES.get(id) || id,
    questions: data.set.questions.length,
    setVersion,
  }
}

function byName(a, b) {
  return a.name.localeCompare(b.name)
}

export async function listGuards() {
  const documents = await listJevDocuments()

  return documents
    .filter(document => isGuardId(document.id))
    .map(toGuard)
    .sort(byName)
}

export function findGuardByName(guards, name, { exceptId = null } = {}) {
  const wanted = name.trim().toLowerCase()

  return guards.find(guard => guard.id !== exceptId && guard.name.toLowerCase() === wanted) ?? null
}

export async function listUsableGuards() {
  const [keyConfigured, guards] = await Promise.all([isConfigured(), listGuards()])
  if (!keyConfigured) return []

  return guards.filter(guard => guard.questions > 0)
}
