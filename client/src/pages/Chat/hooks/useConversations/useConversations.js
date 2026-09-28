import { useEffect, useState } from 'react'
import { deleteConversation, getConversations, searchConversations } from '../../../../services/services.js'

const SEARCH_DEBOUNCE_MS = 300
const EMPTY_RESULT = { query: '', conversations: [] }

export function useConversations(token, reloadKey, activeConversations = []) {
  const [result, setResult] = useState(EMPTY_RESULT)
  const [removedIds, setRemovedIds] = useState([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const trimmed = query.trim()
    const timer = setTimeout(() => setDebouncedQuery(trimmed), trimmed ? SEARCH_DEBOUNCE_MS : 0)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = debouncedQuery ? await searchConversations(token, debouncedQuery) : await getConversations(token)
        if (active) setResult({ query: debouncedQuery, conversations: data.conversations || [] })
      } catch {}
    }
    load()
    return () => {
      active = false
    }
  }, [token, reloadKey, debouncedQuery])

  async function remove(id) {
    setRemovedIds(prev => [...prev, id])
    setResult(prev => ({ ...prev, conversations: prev.conversations.filter(conversation => conversation.id !== id) }))
    try {
      await deleteConversation(token, id)
    } catch {}
  }

  const stillActive = activeConversations.filter(conversation => !removedIds.includes(conversation.id))
  const conversations = result.query
    ? withStreamingMarks(result.conversations, stillActive)
    : withActiveConversations(result.conversations, stillActive)

  return { conversations, remove, query, setQuery, searchedQuery: result.query }
}

function withStreamingMarks(conversations, active) {
  return conversations.map(conversation => {
    const match = active.find(item => item.id === conversation.id)
    return match ? { ...conversation, isStreaming: match.isStreaming } : conversation
  })
}

function withActiveConversations(conversations, active) {
  if (active.length === 0) return conversations

  const unknown = active.filter(item => !conversations.some(conversation => conversation.id === item.id))

  return [...unknown, ...withStreamingMarks(conversations, active)]
}
