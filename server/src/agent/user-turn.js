import { buildAttachmentsPrompt, buildSimilarCasesPrompt } from './system-prompt.js'
import { PROMPT_SECTION_SEPARATOR } from '../constants.js'

export function buildUserTurn(message, { similarCases = [], commands = [], attachments = [] } = {}) {
  const casesPrompt = buildSimilarCasesPrompt(similarCases)
  const attachmentsPrompt = buildAttachmentsPrompt(attachments)
  const prefix = commands.map(name => `/${name}`).join(' ')
  const question = prefix ? `${prefix} ${message}` : message

  return [casesPrompt, attachmentsPrompt, question].filter(Boolean).join(PROMPT_SECTION_SEPARATOR)
}
