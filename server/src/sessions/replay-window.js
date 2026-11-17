function isUserMessage(item) {
  return item?.role === 'user' && (item.type === undefined || item.type === 'message')
}

function findWindowStart(items, maxChars) {
  let used = 0

  for (let index = items.length - 1; index >= 0; index--) {
    used += JSON.stringify(items[index]).length
    if (used > maxChars) return index + 1
  }

  return 0
}

export function keepRecentTurns(items, maxChars) {
  const start = findWindowStart(items, maxChars)
  if (start === 0) return items

  const boundary = items.findIndex((item, index) => index >= start && isUserMessage(item))
  if (boundary !== -1) return items.slice(boundary)

  const newestTurn = items.findLastIndex(isUserMessage)

  return newestTurn === -1 ? items : items.slice(newestTurn)
}
