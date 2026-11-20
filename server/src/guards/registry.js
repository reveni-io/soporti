import { randomBytes } from 'node:crypto'
import { JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT, JEV_SETTINGS_DOCUMENT } from '../constants.js'
import { deleteJevDocument, getJevDocument, listJevDocuments, saveJevDocument } from '../db/jev-documents.js'
import { defaultJevDocument, isCustomGuard, planJevSave } from '../jev/documents.js'
import { isConfigured } from '../jev/settings.js'

const GUARD_ID_BYTES = 4
const BUILT_IN_GUARDS = [
  { id: JEV_LEGAL_DOCUMENT, name: 'Legal' },
  { id: JEV_GITHUB_DOCUMENT, name: 'GitHub PRs' },
]

function toGuard(id, name, document) {
  const data = document?.data ?? defaultJevDocument(id)

  return {
    id,
    name,
    builtIn: !isCustomGuard(id),
    description: data.set.description,
    questions: data.set.questions.length,
    model: data.set.model,
    setVersion: document?.setVersion ?? 0,
    allowSend: id === JEV_GITHUB_DOCUMENT ? null : data.allowSend === true,
  }
}

function byName(a, b) {
  return a.name.localeCompare(b.name)
}

export async function listGuards() {
  const documents = await listJevDocuments()
  const byId = new Map(documents.map(document => [document.id, document]))
  const builtIn = BUILT_IN_GUARDS.map(({ id, name }) => toGuard(id, name, byId.get(id)))
  const custom = documents
    .filter(document => isCustomGuard(document.id))
    .map(document => toGuard(document.id, document.data.name, document))

  return [...builtIn, ...custom.sort(byName)]
}

export async function listChatGuards() {
  const [settings, keyConfigured, guards] = await Promise.all([
    getJevDocument(JEV_SETTINGS_DOCUMENT),
    isConfigured(),
    listGuards(),
  ])
  if (settings?.data?.enabled !== true || !keyConfigured) return []

  return guards.filter(guard => guard.id !== JEV_GITHUB_DOCUMENT && guard.questions > 0 && guard.model)
}

export async function isGuardSendAllowed(guardId) {
  const document = await getJevDocument(guardId)

  return document?.data?.allowSend === true
}

export async function createGuard(name, author) {
  const id = `guard-${randomBytes(GUARD_ID_BYTES).toString('hex')}`
  const defaults = defaultJevDocument(id)
  const { document } = await saveJevDocument(id, {
    expectedRev: 0,
    author,
    defaults,
    plan: current => planJevSave(current, { ...defaults, name }),
  })

  return toGuard(id, name, document)
}

export async function deleteGuard(id) {
  if (!isCustomGuard(id)) return false

  return deleteJevDocument(id)
}
