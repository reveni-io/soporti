import { useCallback, useRef, useState } from 'react'
import { getConversation, isUnauthorized, streamChat } from '../../../../services/services.js'

const FIRST_CHAT_KEY = 'chat-1'
const DATA_PREFIX = 'data: '

function emptyChat() {
  return { sessionId: null, messages: [], isLoading: false }
}

function withChat(chats, key, updater) {
  const chat = chats[key]
  if (!chat) return chats

  const updated = updater(chat)
  if (updated === chat) return chats

  return { ...chats, [key]: updated }
}

function withLastAssistant(chat, updateMessage) {
  const last = chat.messages[chat.messages.length - 1]
  if (!last || last.role !== 'assistant') return chat

  const messages = [...chat.messages]
  messages[messages.length - 1] = updateMessage(last)

  return { ...chat, messages }
}

function withPart(part) {
  return message => ({ ...message, parts: [...message.parts, part] })
}

function withAppendedText(text) {
  return message => {
    const parts = [...message.parts]
    const last = parts[parts.length - 1]

    if (last && last.type === 'text') parts[parts.length - 1] = { ...last, content: last.content + text }
    else parts.push({ type: 'text', content: text })

    return { ...message, parts }
  }
}

function startedToolPart(event) {
  return {
    type: 'tool_call',
    tool: event.tool,
    input: event.input,
    parent: event.parent ?? null,
    done: false,
    startedAt: Date.now(),
  }
}

function withFinishedTool(event) {
  return message => {
    const parts = [...message.parts]

    for (let index = parts.length - 1; index >= 0; index--) {
      const part = parts[index]
      const matches =
        part.type === 'tool_call' &&
        part.tool === event.tool &&
        (part.parent ?? null) === (event.parent ?? null) &&
        !part.done
      if (!matches) continue

      parts[index] = { ...part, done: true, durationMs: Date.now() - part.startedAt }
      break
    }

    return { ...message, parts }
  }
}

function parseEvent(line) {
  try {
    return JSON.parse(line.slice(DATA_PREFIX.length))
  } catch {
    return null
  }
}

async function readEvents(response, onEvent) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) return

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith(DATA_PREFIX)) continue

      const event = parseEvent(line)
      if (event) onEvent(event)
    }
  }
}

function firstUserMessageText(messages) {
  return messages.find(message => message.role === 'user')?.content
}

function toActiveConversations(chats) {
  return Object.values(chats)
    .filter(chat => chat.sessionId)
    .map(chat => ({
      id: chat.sessionId,
      title: firstUserMessageText(chat.messages),
      isStreaming: chat.isLoading,
    }))
    .reverse()
}

export function useChat(token, onAuthError, onArtifactPublished) {
  const [chats, setChats] = useState({ [FIRST_CHAT_KEY]: emptyChat() })
  const [activeKey, setActiveKey] = useState(FIRST_CHAT_KEY)
  const [completedRuns, setCompletedRuns] = useState(0)
  const activeKeyRef = useRef(FIRST_CHAT_KEY)
  const nextKeyRef = useRef(2)
  const abortControllers = useRef(new Map())

  const updateChat = useCallback((key, updater) => {
    setChats(prev => withChat(prev, key, updater))
  }, [])

  const selectChat = useCallback(key => {
    activeKeyRef.current = key
    setActiveKey(key)
  }, [])

  const openChat = useCallback(
    chat => {
      const key = `chat-${nextKeyRef.current}`
      nextKeyRef.current += 1

      setChats(prev => ({ ...prev, [key]: chat }))
      selectChat(key)
    },
    [selectChat]
  )

  const applyEvent = useCallback(
    (key, event) => {
      switch (event.type) {
        case 'session_id':
          updateChat(key, chat => ({ ...chat, sessionId: event.sessionId }))
          break

        case 'text_delta':
          updateChat(key, chat => withLastAssistant(chat, withAppendedText(event.text)))
          break

        case 'tool_start':
          updateChat(key, chat => withLastAssistant(chat, withPart(startedToolPart(event))))
          break

        case 'tool_end':
          updateChat(key, chat => withLastAssistant(chat, withFinishedTool(event)))
          break

        case 'error':
          updateChat(key, chat => withLastAssistant(chat, withPart({ type: 'error', content: event.message })))
          break

        case 'artifact': {
          const published = { artifactId: event.artifactId, title: event.title, version: event.version }

          if (key === activeKeyRef.current) onArtifactPublished?.(published)
          updateChat(key, chat => withLastAssistant(chat, withPart({ type: 'artifact', ...published })))
          break
        }

        case 'feedback_id':
          updateChat(key, chat => withLastAssistant(chat, message => ({ ...message, feedbackId: event.feedbackId })))
          break
      }
    },
    [onArtifactPublished, updateChat]
  )

  const sendMessage = useCallback(
    async (text, selectedSources, profile, skills = [], attachments = []) => {
      const key = activeKeyRef.current
      const chat = chats[key]
      if (!text.trim() || chat.isLoading) return

      const userMessage = { role: 'user', content: text }
      if (skills.length > 0) userMessage.skills = skills
      if (attachments.length > 0) {
        userMessage.attachments = attachments.map(({ name, truncated, imageId }) => ({ name, truncated, imageId }))
      }

      updateChat(key, current => ({
        ...current,
        isLoading: true,
        messages: [...current.messages, userMessage, { role: 'assistant', parts: [] }],
      }))

      const abortController = new AbortController()
      abortControllers.current.set(key, abortController)

      try {
        const response = await streamChat(
          token,
          {
            sessionId: chat.sessionId,
            message: text,
            selectedSources,
            profile,
            skillIds: skills.map(skill => skill.id),
            attachments: attachments.map(({ previewUrl: _previewUrl, ...sent }) => sent),
          },
          abortController.signal
        )

        await readEvents(response, event => applyEvent(key, event))
      } catch (err) {
        if (err.name === 'AbortError') return
        if (isUnauthorized(err)) {
          onAuthError?.()
          return
        }
        updateChat(key, current => withLastAssistant(current, withPart({ type: 'error', content: err.message })))
      } finally {
        updateChat(key, current => ({ ...current, isLoading: false }))
        abortControllers.current.delete(key)
        setCompletedRuns(runs => runs + 1)
      }
    },
    [chats, token, onAuthError, applyEvent, updateChat]
  )

  const stopGeneration = useCallback(() => {
    const key = activeKeyRef.current
    const abortController = abortControllers.current.get(key)
    if (!abortController) return

    abortController.abort()
    updateChat(key, chat => ({ ...chat, isLoading: false }))
  }, [updateChat])

  const newChat = useCallback(() => {
    openChat(emptyChat())
  }, [openChat])

  const loadConversation = useCallback(
    async id => {
      const knownKey = Object.keys(chats).find(key => chats[key].sessionId === id)
      if (knownKey && chats[knownKey].isLoading) {
        selectChat(knownKey)
        return
      }

      try {
        const data = await getConversation(token, id)
        const loaded = { sessionId: id, messages: data.messages || [], isLoading: false }

        if (!knownKey) {
          openChat(loaded)
          return
        }

        updateChat(knownKey, () => loaded)
        selectChat(knownKey)
      } catch (err) {
        if (isUnauthorized(err)) onAuthError?.()
      }
    },
    [chats, token, onAuthError, openChat, selectChat, updateChat]
  )

  const activeChat = chats[activeKey]

  return {
    messages: activeChat.messages,
    isLoading: activeChat.isLoading,
    sessionId: activeChat.sessionId,
    conversationKey: activeKey,
    activeConversations: toActiveConversations(chats),
    completedRuns,
    sendMessage,
    stopGeneration,
    newChat,
    loadConversation,
  }
}
