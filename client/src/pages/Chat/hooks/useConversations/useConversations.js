import { useEffect, useState } from 'react'
import { deleteConversation, getConversations } from '../../../../services/services.js'

export function useConversations(token, reloadKey, activeConversations = []) {
  const [conversations, setConversations] = useState([])
  const [removedIds, setRemovedIds] = useState([])

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
    setRemovedIds(prev => [...prev, id])
    setConversations(prev => prev.filter(conversation => conversation.id !== id))
    try {
      await deleteConversation(token, id)
    } catch {}
  }

  const stillActive = activeConversations.filter(conversation => !removedIds.includes(conversation.id))

  return { conversations: withActiveConversations(conversations, stillActive), remove }
}

function withActiveConversations(conversations, active) {
  if (active.length === 0) return conversations

  const known = conversations.map(conversation => {
    const match = active.find(item => item.id === conversation.id)
    return match ? { ...conversation, isStreaming: match.isStreaming } : conversation
  })
  const unknown = active.filter(item => !conversations.some(conversation => conversation.id === item.id))

  return [...unknown, ...known]
}
