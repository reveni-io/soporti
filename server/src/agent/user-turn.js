import { buildAttachmentsPrompt, buildSimilarCasesPrompt } from './system-prompt.js'

const SEPARATOR = '\n\n---\n\n'

export function buildUserTurn(message, { similarCases = [], commands = [], attachments = [] } = {}) {
  const casesPrompt = buildSimilarCasesPrompt(similarCases)
  const attachmentsPrompt = buildAttachmentsPrompt(attachments)
  const prefix = commands.map(name => `/${name}`).join(' ')
  const question = prefix ? `${prefix} ${message}` : message

  return [casesPrompt, attachmentsPrompt, question].filter(Boolean).join(SEPARATOR)
}
