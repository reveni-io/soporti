import { useState, useRef, useCallback } from 'react'

export function useChat(token, onAuthError) {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const sessionIdRef = useRef(null)
  const abortRef = useRef(null)

  const sendMessage = useCallback(
    async (text, selectedSources, profile) => {
      if (!text.trim() || isLoading) return

      setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', parts: [] }])
      setIsLoading(true)

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            message: text,
            selectedSources,
            profile,
          }),
          signal: abortController.signal,
        })

        if (response.status === 401) {
          onAuthError?.()
          return
        }

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Server error' }))
          throw new Error(err.error || `HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            let data
            try {
              data = JSON.parse(line.slice(6))
            } catch {
              continue
            }

            switch (data.type) {
              case 'session_id':
                sessionIdRef.current = data.sessionId
                break

              case 'text_delta':
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (!last || last.role !== 'assistant') return prev

                  const parts = [...last.parts]
                  const lastPart = parts[parts.length - 1]

                  if (lastPart && lastPart.type === 'text') {
                    parts[parts.length - 1] = { ...lastPart, content: lastPart.content + data.text }
                  } else {
                    parts.push({ type: 'text', content: data.text })
                  }
                  updated[updated.length - 1] = { ...last, parts }
                  return updated
                })
                break

              case 'tool_start':
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (!last || last.role !== 'assistant') return prev

                  const parts = [...last.parts]
                  parts.push({
                    type: 'tool_call',
                    tool: data.tool,
                    input: data.input,
                    done: false,
                    startedAt: Date.now(),
                  })
                  updated[updated.length - 1] = { ...last, parts }
                  return updated
                })
                break

              case 'tool_end':
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (!last || last.role !== 'assistant') return prev

                  const parts = [...last.parts]
                  for (let i = parts.length - 1; i >= 0; i--) {
                    if (parts[i].type === 'tool_call' && parts[i].tool === data.tool && !parts[i].done) {
                      parts[i] = { ...parts[i], done: true, durationMs: Date.now() - parts[i].startedAt }
                      break
                    }
                  }
                  updated[updated.length - 1] = { ...last, parts }
                  return updated
                })
                break

              case 'error':
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (!last || last.role !== 'assistant') return prev

                  const parts = [...last.parts]
                  parts.push({ type: 'error', content: data.message })
                  updated[updated.length - 1] = { ...last, parts }
                  return updated
                })
                break

              case 'feedback_id':
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (!last || last.role !== 'assistant') return prev
                  updated[updated.length - 1] = { ...last, feedbackId: data.feedbackId }
                  return updated
                })
                break

              case 'done':
                break
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              parts: [...last.parts, { type: 'error', content: err.message }],
            }
          }
          return updated
        })
      } finally {
        setIsLoading(false)
        abortRef.current = null
      }
    },
    [isLoading, token, onAuthError]
  )

  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      setIsLoading(false)
    }
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    sessionIdRef.current = null
  }, [])

  const loadConversation = useCallback(
    async id => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/conversations/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (response.status === 401) {
          onAuthError?.()
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const data = await response.json()
        const restored = (data.messages || []).map(m => {
          if (m.role === 'user') {
            const text = (m.parts || [])
              .filter(p => p.type === 'text')
              .map(p => p.content)
              .join('')
            return { role: 'user', content: text }
          }
          return { role: 'assistant', parts: m.parts || [] }
        })

        sessionIdRef.current = id
        setMessages(restored)
      } catch {
      }
    },
    [token, onAuthError]
  )

  return {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    clearChat,
    loadConversation,
    currentSessionId: sessionIdRef,
  }
}
