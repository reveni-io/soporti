import { JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT } from '../constants.js'
import { listJevDocuments } from '../db/jev-documents.js'
import { defaultJevDocument, isCustomGuardId } from '../jev/documents.js'
import { isConfigured } from '../jev/settings.js'

const BUILT_IN_GUARDS = [
  { id: JEV_LEGAL_DOCUMENT, name: 'Legal' },
  { id: JEV_GITHUB_DOCUMENT, name: 'GitHub PRs' },
]

function toGuard({ id, name, builtIn }, document) {
  const data = document?.data ?? defaultJevDocument(id)

  return {
    id,
    name: data.name || name,
    builtIn,
    description: data.set.description,
    questions: data.set.questions.length,
    setVersion: document?.setVersion ?? 0,
  }
}

function byName(a, b) {
  return a.name.localeCompare(b.name)
}

export async function listGuards() {
  const documents = await listJevDocuments()
  const stored = new Map(documents.map(document => [document.id, document]))
  const builtIns = BUILT_IN_GUARDS.map(guard => toGuard({ ...guard, builtIn: true }, stored.get(guard.id)))
  const custom = documents
    .filter(document => isCustomGuardId(document.id))
    .map(document => toGuard({ id: document.id, name: '', builtIn: false }, document))

  return [...builtIns, ...custom.sort(byName)]
}

export function findGuardByName(guards, name, { exceptId = null } = {}) {
  const wanted = name.trim().toLowerCase()

  return guards.find(guard => guard.id !== exceptId && guard.name.toLowerCase() === wanted) ?? null
}

export async function listChatGuards() {
  const [keyConfigured, guards] = await Promise.all([isConfigured(), listGuards()])
  if (!keyConfigured) return []

  return guards.filter(guard => guard.id !== JEV_GITHUB_DOCUMENT && guard.questions > 0)
}
