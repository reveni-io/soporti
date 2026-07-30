import { buildSimilarCasesPrompt } from './system-prompt.js'

const SEPARATOR = '\n\n---\n\n'

export function buildUserTurn(message, { similarCases = [], commands = [] } = {}) {
  const casesPrompt = buildSimilarCasesPrompt(similarCases)
  const prefix = commands.map(name => `/${name}`).join(' ')
  const question = prefix ? `${prefix} ${message}` : message

  if (!casesPrompt) return question

  return `${casesPrompt}${SEPARATOR}${question}`
}
