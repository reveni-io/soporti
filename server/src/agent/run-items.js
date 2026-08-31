export const UNKNOWN_TOOL = 'unknown'

export function toolCallFromRawItem(rawItem, parent = null) {
  return {
    name: rawItem?.name,
    arguments: rawItem?.arguments,
    callId: rawItem?.callId || rawItem?.id,
    parent,
  }
}

export function toolCallsFromResult(result) {
  return (result?.newItems ?? [])
    .filter(item => item?.type === 'tool_call_item')
    .map(item => ({ name: item.rawItem?.name, arguments: item.rawItem?.arguments }))
}

export function toolNames(toolCalls) {
  return (toolCalls ?? []).map(call => call?.name).filter(name => name && name !== UNKNOWN_TOOL)
}

export function toolNamesFromResult(result) {
  return toolNames(toolCallsFromResult(result))
}
