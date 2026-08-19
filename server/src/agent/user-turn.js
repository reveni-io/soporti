import { buildAttachmentsPrompt, buildSimilarCasesPrompt, buildQuestionPrompt } from './system-prompt.js'
import { PROMPT_SECTION_SEPARATOR } from '../constants.js'

export function buildUserTurn(message, { similarCases = [], commands = [], attachments = [] } = {}) {
  const casesPrompt = buildSimilarCasesPrompt(similarCases)
  const attachmentsPrompt = buildAttachmentsPrompt(attachments)
  const prefix = commands.map(name => `/${name}`).join(' ')
  const question = prefix ? `${prefix} ${message}` : message

  if (!casesPrompt && !attachmentsPrompt) return question

  return [casesPrompt, attachmentsPrompt, buildQuestionPrompt(question)].filter(Boolean).join(PROMPT_SECTION_SEPARATOR)
}
