import { useEffect, useState } from 'react'
import { deleteConversation, getConversations } from '../../../../services/services.js'

export function useConversations(token, reloadKey, activeConversation = null) {
  const [conversations, setConversations] = useState([])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getConversations(token)
        if (active) setConversations(data.conversations || [])
      } catch {}
    }
    load()
    return () => {
      active = false
    }
  }, [token, reloadKey])

  async function remove(id) {
    setConversations(prev => prev.filter(conversation => conversation.id !== id))
    try {
      await deleteConversation(token, id)
    } catch {}
  }

  return { conversations: withActiveConversation(conversations, activeConversation), remove }
}

function withActiveConversation(conversations, active) {
  if (!active) return conversations

  const known = conversations.some(conversation => conversation.id === active.id)
  if (!known) return [active, ...conversations]

  return conversations.map(conversation =>
    conversation.id === active.id ? { ...conversation, isStreaming: active.isStreaming } : conversation
  )
}
