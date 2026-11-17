import { withConversationLock } from '../sessions/conversation-lock.js'

export function buildBotTurnItems(note, answer) {
  return [
    { type: 'message', role: 'user', content: note },
    { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: answer }] },
  ]
}

export async function appendToBotChat(conversationStore, { conversationId, session }, { parts, items = [] }) {
  await withConversationLock(conversationId, () => {
    return conversationStore.saveTurn(conversationId, {
      lastResponseId: null,
      session,
      unpersistedItems: items,
      uiMessages: [{ role: 'assistant', parts }],
    })
  })
}
