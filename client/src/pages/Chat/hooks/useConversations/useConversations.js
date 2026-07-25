import { useEffect, useState } from 'react'
import { deleteConversation, getConversations } from '../../../../services/services.js'

export function useConversations(token, reloadKey) {
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

  return { conversations, remove }
}
