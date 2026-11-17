import { describe, it, expect, vi } from 'vitest'
import { protocol } from '@openai/agents'
import { withConversationLock } from '../sessions/conversation-lock.js'
import { appendToBotChat, buildBotTurnItems } from './bot-chat.js'

const CONVERSATION = { conversationId: 'bot-conversation', session: { id: 'session' } }

describe('buildBotTurnItems', () => {
  it('builds a user note and an assistant answer the agents sdk accepts as input items', () => {
    const [note, answer] = buildBotTurnItems('[Routine "Triage" ran.]', 'Three new tickets.')

    expect(protocol.UserMessageItem.parse(note)).toEqual(note)
    expect(protocol.AssistantMessageItem.parse(answer)).toEqual(answer)
    expect(note).toEqual({ type: 'message', role: 'user', content: '[Routine "Triage" ran.]' })
    expect(answer).toEqual({
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Three new tickets.' }],
    })
  })
})

describe('appendToBotChat', () => {
  it('stores the message and the session items and drops the continuation token', async () => {
    const store = { saveTurn: vi.fn().mockResolvedValue(undefined) }
    const items = buildBotTurnItems('note', 'answer')
    const parts = [{ type: 'text', content: 'answer' }]

    await appendToBotChat(store, CONVERSATION, { parts, items })

    expect(store.saveTurn).toHaveBeenCalledTimes(1)
    expect(store.saveTurn).toHaveBeenCalledWith('bot-conversation', {
      lastResponseId: null,
      session: { id: 'session' },
      unpersistedItems: items,
      uiMessages: [{ role: 'assistant', parts }],
    })
  })

  it('stores only the message when there are no session items', async () => {
    const store = { saveTurn: vi.fn().mockResolvedValue(undefined) }

    await appendToBotChat(store, CONVERSATION, { parts: [{ type: 'error', content: 'It failed.' }] })

    expect(store.saveTurn.mock.calls[0][1].unpersistedItems).toEqual([])
  })

  it('waits for the turn that holds the conversation lock', async () => {
    const store = { saveTurn: vi.fn().mockResolvedValue(undefined) }
    let release
    const turn = withConversationLock('bot-conversation', () => {
      return new Promise(resolve => {
        release = resolve
      })
    })

    const appended = appendToBotChat(store, CONVERSATION, { parts: [] })
    await new Promise(resolve => setImmediate(resolve))

    expect(store.saveTurn).not.toHaveBeenCalled()

    release()
    await Promise.all([turn, appended])

    expect(store.saveTurn).toHaveBeenCalledTimes(1)
  })
})
