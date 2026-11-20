import { JEV_GITHUB_DOCUMENT, JEV_LEGAL_DOCUMENT } from '../constants.js'
import { getJevDocument } from '../db/jev-documents.js'
import { defaultJevDocument } from '../jev/documents.js'
import { isConfigured } from '../jev/settings.js'

const GUARDS = [
  { id: JEV_LEGAL_DOCUMENT, name: 'Legal' },
  { id: JEV_GITHUB_DOCUMENT, name: 'GitHub PRs' },
]

function toGuard({ id, name }, document) {
  const data = document?.data ?? defaultJevDocument(id)

  return {
    id,
    name,
    enabled: data.enabled === true,
    description: data.set.description,
    questions: data.set.questions.length,
    model: data.set.model,
    setVersion: document?.setVersion ?? 0,
    allowSend: id === JEV_GITHUB_DOCUMENT ? null : data.allowSend === true,
  }
}

export async function listGuards() {
  const documents = await Promise.all(GUARDS.map(({ id }) => getJevDocument(id)))

  return GUARDS.map((guard, index) => toGuard(guard, documents[index]))
}

export async function listChatGuards() {
  const [keyConfigured, guards] = await Promise.all([isConfigured(), listGuards()])
  if (!keyConfigured) return []

  return guards.filter(guard => guard.id !== JEV_GITHUB_DOCUMENT && guard.enabled && guard.questions > 0 && guard.model)
}

export async function isGuardSendAllowed(guardId) {
  const document = await getJevDocument(guardId)

  return document?.data?.allowSend === true
}
