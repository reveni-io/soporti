import { generatePath } from 'react-router-dom'
import { CONVERSATION_PARAM } from '../../../../constants.js'
import { ROUTES } from '../../../../router/constants.js'
import { showLocalNotification } from '../../../../pwa/local-notification.js'
import { plainTextExcerpt } from '../useMessageRail/message-preview.js'

const ANSWER_READY_TITLE = 'Your answer is ready'
const BODY_MAX_LENGTH = 180
const ELLIPSIS_LENGTH = 1
const HIDDEN = 'hidden'
const BOT_TAG_PREFIX = 'bot-'
const CONVERSATION_TAG_PREFIX = 'conversation-'

function trackSession(answer, event) {
  answer.sessionId = event.sessionId
}

function trackText(answer, event) {
  answer.segments[answer.segments.length - 1] += event.text
}

function trackTool(answer) {
  answer.segments.push('')
}

function trackError(answer) {
  answer.hasError = true
}

function trackDone(answer) {
  answer.isDone = true
}

const ANSWER_TRACKERS = new Map([
  ['session_id', trackSession],
  ['text_delta', trackText],
  ['tool_start', trackTool],
  ['error', trackError],
  ['done', trackDone],
])

export function createAnswer({ sessionId, botId }) {
  return { sessionId, botId, segments: [''], hasError: false, isDone: false }
}

export function trackAnswer(answer, event) {
  ANSWER_TRACKERS.get(event.type)?.(answer, event)
}

function answerTarget({ sessionId, botId }) {
  if (botId) return { url: generatePath(ROUTES.BOT, { botId: String(botId) }), tag: `${BOT_TAG_PREFIX}${botId}` }

  return {
    url: `${ROUTES.CHAT}?${new URLSearchParams({ [CONVERSATION_PARAM]: sessionId })}`,
    tag: `${CONVERSATION_TAG_PREFIX}${sessionId}`,
  }
}

function isFinishedUnseen(answer) {
  return answer.isDone && !answer.hasError && document.visibilityState === HIDDEN
}

function finalText(answer) {
  return answer.segments.findLast(segment => segment.trim()) ?? ''
}

export function notifyAnswerReady(answer) {
  if (!isFinishedUnseen(answer)) return

  const { url, tag } = answerTarget(answer)

  showLocalNotification({
    title: ANSWER_READY_TITLE,
    body: plainTextExcerpt(finalText(answer), BODY_MAX_LENGTH - ELLIPSIS_LENGTH),
    url,
    tag,
  })
}
