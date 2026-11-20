import { JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT } from '../constants.js'
import { getJevDocument } from '../db/jev-documents.js'
import { defaultJevDocument } from '../jev/documents.js'
import { areJevCallsEnabled, isConfigured } from '../jev/settings.js'

const GUARDS = [
  { id: JEV_LEGAL_DOCUMENT, name: 'Legal' },
  { id: JEV_GITHUB_DOCUMENT, name: 'GitHub PRs' },
]

function toGuard({ id, name }, document) {
  const data = document?.data ?? defaultJevDocument(id)

  return {
    id,
    name,
    description: data.set.description,
    questions: data.set.questions.length,
    model: data.set.model,
    setVersion: document?.setVersion ?? 0,
  }
}

export async function listGuards() {
  const documents = await Promise.all(GUARDS.map(({ id }) => getJevDocument(id)))

  return GUARDS.map((guard, index) => toGuard(guard, documents[index]))
}

export async function listChatGuards() {
  const [keyConfigured, enabled, guards] = await Promise.all([isConfigured(), areJevCallsEnabled(), listGuards()])
  if (!keyConfigured || !enabled) return []

  return guards.filter(guard => guard.id !== JEV_GITHUB_DOCUMENT && guard.questions > 0 && guard.model)
}
