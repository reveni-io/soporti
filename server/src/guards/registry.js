import { JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT } from '../constants.js'
import { listJevDocuments } from '../db/jev-documents.js'
import { isGuardId } from '../jev/documents.js'
import { areJevCallsEnabled, isConfigured } from '../jev/settings.js'

const LEGACY_NAMES = new Map([
  [JEV_LEGAL_DOCUMENT, 'Legal'],
  [JEV_GITHUB_DOCUMENT, 'GitHub PRs'],
])

function toGuard({ id, data, setVersion }) {
  return {
    id,
    name: data.name || LEGACY_NAMES.get(id) || id,
    description: data.set.description,
    questions: data.set.questions.length,
    model: data.set.model,
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
  const [keyConfigured, enabled, guards] = await Promise.all([isConfigured(), areJevCallsEnabled(), listGuards()])
  if (!keyConfigured || !enabled) return []

  return guards.filter(guard => guard.questions > 0 && guard.model)
}
