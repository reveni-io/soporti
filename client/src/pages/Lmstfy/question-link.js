import { QUESTION_PARAM } from '../../constants.js'
import { ROUTES } from '../../router/constants.js'

export function buildReplayUrl(question) {
  return `${window.location.origin}${ROUTES.LMSTFY}?${QUESTION_PARAM}=${encodeURIComponent(question)}`
}

export function buildChatPath(question) {
  return `${ROUTES.CHAT}?${QUESTION_PARAM}=${encodeURIComponent(question)}`
}
