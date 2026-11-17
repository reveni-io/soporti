const tails = new Map()

function ignore() {}

export function withConversationLock(conversationId, task) {
  const previous = tails.get(conversationId) ?? Promise.resolve()
  const result = previous.then(task)
  const tail = result.then(ignore, ignore)

  tails.set(conversationId, tail)
  tail.then(() => {
    if (tails.get(conversationId) === tail) tails.delete(conversationId)
  })

  return result
}

export function _countConversationLocksForTests() {
  return tails.size
}
