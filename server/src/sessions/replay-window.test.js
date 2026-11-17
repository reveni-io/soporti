import { describe, it, expect } from 'vitest'
import { keepRecentTurns } from './replay-window.js'

function user(content) {
  return { type: 'message', role: 'user', content }
}

function assistant(text) {
  return { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] }
}

function toolCall(callId) {
  return { type: 'function_call', callId, name: 'zendesk_search_tickets', arguments: '{}' }
}

function toolResult(callId, output) {
  return { type: 'function_call_result', callId, name: 'zendesk_search_tickets', status: 'completed', output }
}

function charsOf(items) {
  return items.reduce((total, item) => total + JSON.stringify(item).length, 0)
}

const OLD_TURN = [user('old question'), toolCall('c1'), toolResult('c1', 'x'.repeat(500)), assistant('old answer')]
const RECENT_TURN = [user('recent question'), toolCall('c2'), toolResult('c2', 'recent result'), assistant('recent')]
const NEWEST_TURN = [user('newest question'), assistant('newest answer')]

describe('keepRecentTurns', () => {
  it('leaves a history that fits the budget untouched', () => {
    const items = [...OLD_TURN, ...RECENT_TURN, ...NEWEST_TURN]

    expect(keepRecentTurns(items, charsOf(items))).toBe(items)
    expect(keepRecentTurns([], 10)).toEqual([])
  })

  it('drops the oldest turns once the budget is exceeded, measured on the JSON of each item', () => {
    const items = [...OLD_TURN, ...RECENT_TURN, ...NEWEST_TURN]
    const budget = charsOf([...RECENT_TURN, ...NEWEST_TURN])

    expect(keepRecentTurns(items, budget)).toEqual([...RECENT_TURN, ...NEWEST_TURN])
    expect(keepRecentTurns(items, budget - 1)).toEqual(NEWEST_TURN)
  })

  it('starts the window at the next user message so a tool call is never split from its result', () => {
    const items = [...OLD_TURN, ...RECENT_TURN, ...NEWEST_TURN]
    const budget = charsOf([toolResult('c2', 'recent result'), assistant('recent'), ...NEWEST_TURN])

    const kept = keepRecentTurns(items, budget)

    expect(kept).toEqual(NEWEST_TURN)
    expect(kept.some(item => item.type === 'function_call_result')).toBe(false)
  })

  it('never keeps a tool result without its call, however the budget falls', () => {
    const items = [...OLD_TURN, ...RECENT_TURN, ...NEWEST_TURN]

    for (let budget = 1; budget <= charsOf(items); budget += 7) {
      const kept = keepRecentTurns(items, budget)
      const calls = new Set(kept.filter(item => item.type === 'function_call').map(item => item.callId))
      const results = kept.filter(item => item.type === 'function_call_result')

      expect(kept[0]).toMatchObject({ role: 'user' })
      expect(results.every(result => calls.has(result.callId))).toBe(true)
    }
  })

  it('keeps the newest full turn even when it alone is over the budget', () => {
    const hugeTurn = [user('summarize'), toolCall('c3'), toolResult('c3', 'y'.repeat(2000)), assistant('done')]
    const items = [...OLD_TURN, ...hugeTurn]

    expect(keepRecentTurns(items, 100)).toEqual(hugeTurn)
  })

  it('treats a user message without an explicit type as a turn boundary', () => {
    const items = [...OLD_TURN, { role: 'user', content: 'plain' }, assistant('reply')]

    expect(keepRecentTurns(items, charsOf(items.slice(-2)))).toEqual(items.slice(-2))
  })

  it('leaves a history without any user message as it is', () => {
    const items = [assistant('a'.repeat(300)), assistant('b')]

    expect(keepRecentTurns(items, 10)).toBe(items)
  })
})
