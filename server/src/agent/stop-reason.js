export const STOP_REASON_TURN_LIMIT = 'turn_limit'
export const STOP_REASON_REFUSAL = 'refusal'

const NOTICES = {
  [STOP_REASON_TURN_LIMIT]:
    'I ran out of investigation steps before I could finish, so the answer above is incomplete. Ask me to continue and I will pick up from where I stopped.',
  [STOP_REASON_REFUSAL]: 'I stopped because I cannot answer that. Rephrase the question and I will try again.',
}

function noticeFor(reason) {
  return NOTICES[reason] ?? ''
}

export function createStopReasonTracker() {
  let reason = null

  function record(nextReason) {
    reason = nextReason

    return { finalOutput: NOTICES[nextReason] }
  }

  return {
    stopReason: () => reason,
    notice: () => noticeFor(reason),
    errorHandlers: {
      maxTurns: () => record(STOP_REASON_TURN_LIMIT),
      modelRefusal: () => record(STOP_REASON_REFUSAL),
    },
  }
}
