import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChat } from './useChat.js'

function createSSEResponse(events) {
  const text = events.map(e => `data: ${JSON.stringify(e)}`).join('\n\n') + '\n\n'
  const encoder = new TextEncoder()
  const encoded = encoder.encode(text)

  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => {
        let done = false
        return {
          read: async () => {
            if (done) return { done: true, value: undefined }
            done = true
            return { done: false, value: encoded }
          },
        }
      },
    },
  }
}

function createManualStream() {
  const encoder = new TextEncoder()
  const chunks = []
  let pendingRead = null
  let closed = false

  function deliver() {
    if (!pendingRead) return

    if (chunks.length > 0) {
      const resolve = pendingRead
      pendingRead = null
      resolve({ done: false, value: chunks.shift() })
      return
    }
    if (closed) {
      const resolve = pendingRead
      pendingRead = null
      resolve({ done: true, value: undefined })
    }
  }

  return {
    response: {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: () =>
            new Promise(resolve => {
              pendingRead = resolve
              deliver()
            }),
        }),
      },
    },
    push(event) {
      chunks.push(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      deliver()
    },
    close() {
      closed = true
      deliver()
    },
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useChat', () => {
  it('starts with empty messages and not loading', () => {
    const { result } = renderHook(() => useChat('token', vi.fn()))
    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('sendMessage adds user and assistant messages', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        createSSEResponse([
          { type: 'session_id', sessionId: 'sess-1' },
          { type: 'text_delta', text: 'Hello' },
          { type: 'done' },
        ])
      )

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: ['org/repo'], profile: 'support' })
    })

    expect(result.current.messages.length).toBe(2)
    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'hi' })
    expect(result.current.messages[1].role).toBe('assistant')
    expect(result.current.messages[1].parts.some(p => p.type === 'text' && p.content === 'Hello')).toBe(true)
  })

  it('sends the skill ids in the body and tags the UI message with the skills', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('hi', {
        selectedSources: ['org/repo'],
        profile: 'support',
        skills: [{ id: 5, name: 'bug-triage' }],
      })
    })

    expect(result.current.messages[0]).toEqual({
      role: 'user',
      content: 'hi',
      skills: [{ id: 5, name: 'bug-triage' }],
    })
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).skillIds).toEqual([5])
    expect(JSON.parse(options.body).message).toBe('hi')
    expect(JSON.parse(options.body).timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('defaults skillIds to an empty array when omitted', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: ['org/repo'], profile: 'support' })
    })

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).skillIds).toEqual([])
  })

  it('sends the extracted attachment text and tags the UI message with the metadata only', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('summarize it', {
        selectedSources: ['org/repo'],
        profile: 'support',
        attachments: [{ name: 'spec.pdf', text: 'The API returns 402.', truncated: true }],
      })
    })

    expect(result.current.messages[0]).toEqual({
      role: 'user',
      content: 'summarize it',
      attachments: [{ name: 'spec.pdf', truncated: true }],
    })
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).attachments).toEqual([
      { name: 'spec.pdf', text: 'The API returns 402.', truncated: true },
    ])
  })

  it('sends the image id and never the local preview of an attached image', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

    const { result } = renderHook(() => useChat('token', vi.fn()))
    const imageId = '22222222-2222-4222-8222-222222222222'

    await act(async () => {
      await result.current.sendMessage('what is this?', {
        selectedSources: ['org/repo'],
        profile: 'support',
        attachments: [{ name: 'error.png', imageId, previewUrl: 'blob:local' }],
      })
    })

    expect(result.current.messages[0].attachments).toEqual([{ name: 'error.png', imageId }])
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).attachments).toEqual([{ name: 'error.png', imageId }])
  })

  it('sends an empty attachments list when there is nothing attached', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: ['org/repo'], profile: 'support' })
    })

    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'hi' })
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).attachments).toEqual([])
  })

  it('does not send empty messages', async () => {
    global.fetch = vi.fn()
    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('   ', { selectedSources: [], profile: 'support' })
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
  })

  it('ignores a second message while the displayed conversation is being answered', async () => {
    const stream = createManualStream()
    global.fetch = vi.fn().mockResolvedValue(stream.response)

    const { result } = renderHook(() => useChat('token', vi.fn()))

    act(() => {
      result.current.sendMessage('first', { selectedSources: [], profile: 'support' })
    })
    await waitFor(() => expect(result.current.isLoading).toBe(true))

    await act(async () => {
      await result.current.sendMessage('second', { selectedSources: [], profile: 'support' })
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(result.current.messages).toHaveLength(2)
  })

  it('skips a malformed event without dropping the rest of the stream', async () => {
    const encoder = new TextEncoder()
    const encoded = encoder.encode('data: {oops\n\ndata: {"type":"text_delta","text":"Hello"}\n\n')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let sent = false
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined }
              sent = true
              return { done: false, value: encoded }
            },
          }
        },
      },
    })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: [], profile: 'support' })
    })

    expect(result.current.messages[1].parts).toEqual([{ type: 'text', content: 'Hello' }])
  })

  it('handles tool_start and tool_end events', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        createSSEResponse([
          { type: 'session_id', sessionId: 'sess-1' },
          { type: 'tool_start', tool: 'search_code', input: { query: 'auth' } },
          { type: 'tool_end', tool: 'search_code' },
          { type: 'text_delta', text: 'Found it' },
          { type: 'done' },
        ])
      )

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('find auth', { selectedSources: [], profile: 'tech' })
    })

    const parts = result.current.messages[1].parts
    const toolPart = parts.find(p => p.type === 'tool_call')
    expect(toolPart.tool).toBe('search_code')
    expect(toolPart.done).toBe(true)
  })

  it('handles error events', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        createSSEResponse([
          { type: 'session_id', sessionId: 'sess-1' },
          { type: 'error', message: 'Something went wrong' },
          { type: 'done' },
        ])
      )

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('test', { selectedSources: [], profile: 'support' })
    })

    const parts = result.current.messages[1].parts
    expect(parts.some(p => p.type === 'error' && p.content === 'Something went wrong')).toBe(true)
  })

  it('tags the answer with the feedback id the stream announces', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        createSSEResponse([
          { type: 'session_id', sessionId: 'sess-1' },
          { type: 'feedback_id', feedbackId: 42 },
          { type: 'done' },
        ])
      )

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: [], profile: 'support' })
    })

    expect(result.current.messages[1].feedbackId).toBe(42)
  })

  it('calls onAuthError on 401 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    const onAuthError = vi.fn()
    const { result } = renderHook(() => useChat('token', onAuthError))

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: [], profile: 'support' })
    })

    expect(onAuthError).toHaveBeenCalled()
  })

  it('exposes the conversation id as soon as the stream announces it', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

    const { result } = renderHook(() => useChat('token', vi.fn()))
    expect(result.current.sessionId).toBeNull()

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: [], profile: 'support' })
    })

    expect(result.current.sessionId).toBe('sess-1')
  })

  it('sends the announced conversation id on the following turn', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: [], profile: 'support' })
    })
    await act(async () => {
      await result.current.sendMessage('and then?', { selectedSources: [], profile: 'support' })
    })

    expect(JSON.parse(global.fetch.mock.calls[0][1].body).sessionId).toBeNull()
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).sessionId).toBe('sess-1')
  })

  it('exposes the loaded conversation id and drops it on a new chat', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages: [] }) })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.loadConversation('conv-1')
    })
    expect(result.current.sessionId).toBe('conv-1')

    act(() => {
      result.current.newChat()
    })
    expect(result.current.sessionId).toBeNull()
  })

  it('newChat shows an empty transcript', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        createSSEResponse([
          { type: 'session_id', sessionId: 'sess-1' },
          { type: 'text_delta', text: 'Hi' },
          { type: 'done' },
        ])
      )

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: [], profile: 'support' })
    })
    expect(result.current.messages.length).toBe(2)

    act(() => {
      result.current.newChat()
    })
    expect(result.current.messages).toEqual([])
  })

  it('loadConversation restores the render-shape messages served by the API', async () => {
    const messages = [
      { role: 'user', content: 'How does auth work?' },
      { role: 'assistant', parts: [{ type: 'text', content: 'It uses JWT.' }] },
    ]
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages }) })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.loadConversation('conv-1')
    })

    expect(result.current.messages).toEqual(messages)
  })

  it('advances the conversation key when a conversation is loaded or a new chat starts', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages: [] }) })

    const { result } = renderHook(() => useChat('token', vi.fn()))
    const initialKey = result.current.conversationKey

    await act(async () => {
      await result.current.loadConversation('conv-1')
    })
    const loadedKey = result.current.conversationKey

    act(() => {
      result.current.newChat()
    })

    expect(loadedKey).not.toBe(initialKey)
    expect(result.current.conversationKey).not.toBe(loadedKey)
  })

  it('loadConversation keeps invoked skills served on user messages', async () => {
    const messages = [{ role: 'user', content: 'hi', skills: [{ id: 5, name: 'bug-triage' }] }]
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages }) })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.loadConversation('conv-1')
    })

    expect(result.current.messages).toEqual(messages)
  })

  it('loadConversation calls onAuthError on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    const onAuthError = vi.fn()
    const { result } = renderHook(() => useChat('token', onAuthError))

    await act(async () => {
      await result.current.loadConversation('conv-1')
    })

    expect(onAuthError).toHaveBeenCalled()
  })

  it('loadConversation leaves messages untouched on failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.loadConversation('conv-1')
    })

    expect(result.current.messages).toEqual([])
  })

  it('refetches a conversation that is already in memory and not being answered', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ messages: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ role: 'user', content: 'saved by a schedule' }] }),
      })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.loadConversation('conv-1')
    })
    act(() => {
      result.current.newChat()
    })
    await act(async () => {
      await result.current.loadConversation('conv-1')
    })

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(result.current.messages).toEqual([{ role: 'user', content: 'saved by a schedule' }])
  })

  it('keeps reporting a conversation it holds once its answer is done', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ role: 'user', content: 'How does auth work?' }] }),
    })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.loadConversation('conv-1')
    })
    act(() => {
      result.current.newChat()
    })

    expect(result.current.activeConversations).toEqual([
      { id: 'conv-1', title: 'How does auth work?', isStreaming: false },
    ])
  })

  it('handles HTTP error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('test', { selectedSources: [], profile: 'support' })
    })

    const parts = result.current.messages[1].parts
    expect(parts.some(p => p.type === 'error')).toBe(true)
  })

  it('counts every finished run so the conversation list can be refreshed', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

    const { result } = renderHook(() => useChat('token', vi.fn()))
    expect(result.current.completedRuns).toBe(0)

    await act(async () => {
      await result.current.sendMessage('hi', { selectedSources: [], profile: 'support' })
    })

    expect(result.current.completedRuns).toBe(1)
  })

  it('keeps answering the conversation the user leaves and shows the answer on the way back', async () => {
    const stream = createManualStream()
    global.fetch = vi.fn().mockResolvedValue(stream.response)

    const { result } = renderHook(() => useChat('token', vi.fn()))

    act(() => {
      result.current.sendMessage('long research', { selectedSources: [], profile: 'support' })
    })
    stream.push({ type: 'session_id', sessionId: 'sess-1' })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    act(() => {
      result.current.newChat()
    })
    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)

    stream.push({ type: 'text_delta', text: 'still working' })
    await waitFor(() => expect(result.current.activeConversations[0].isStreaming).toBe(true))
    expect(result.current.messages).toEqual([])

    await act(async () => {
      await result.current.loadConversation('sess-1')
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.messages[1].parts).toEqual([{ type: 'text', content: 'still working' }])
  })

  it('never appends the running answer to the conversation the user opens instead', async () => {
    const stream = createManualStream()
    const loaded = [
      { role: 'user', content: 'How does auth work?' },
      { role: 'assistant', parts: [{ type: 'text', content: 'It uses JWT.' }] },
    ]
    global.fetch = vi.fn().mockImplementation(url => {
      if (String(url).includes('/api/conversations/')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ messages: loaded }) })
      }
      return Promise.resolve(stream.response)
    })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    act(() => {
      result.current.sendMessage('long research', { selectedSources: [], profile: 'support' })
    })
    stream.push({ type: 'session_id', sessionId: 'sess-1' })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    await act(async () => {
      await result.current.loadConversation('conv-2')
    })

    stream.push({ type: 'text_delta', text: 'still working' })
    stream.push({ type: 'tool_start', tool: 'search_code', input: {} })
    await waitFor(() => expect(result.current.activeConversations).toHaveLength(2))

    expect(result.current.messages).toEqual(loaded)
    expect(result.current.isLoading).toBe(false)
  })

  it('marks every in-flight conversation, newest first', async () => {
    const first = createManualStream()
    const second = createManualStream()
    const streams = [first, second]
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(streams.shift().response))

    const { result } = renderHook(() => useChat('token', vi.fn()))

    act(() => {
      result.current.sendMessage('why did the payout fail?', { selectedSources: [], profile: 'support' })
    })
    first.push({ type: 'session_id', sessionId: 'sess-1' })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    act(() => {
      result.current.newChat()
    })
    act(() => {
      result.current.sendMessage('how does auth work?', { selectedSources: [], profile: 'support' })
    })
    second.push({ type: 'session_id', sessionId: 'sess-2' })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-2'))

    expect(result.current.activeConversations).toEqual([
      { id: 'sess-2', title: 'how does auth work?', isStreaming: true },
      { id: 'sess-1', title: 'why did the payout fail?', isStreaming: true },
    ])
  })

  it('stops only the displayed conversation', async () => {
    const first = createManualStream()
    const second = createManualStream()
    const streams = [first, second]
    const signals = []
    global.fetch = vi.fn().mockImplementation((url, options) => {
      signals.push(options.signal)
      return Promise.resolve(streams.shift().response)
    })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    act(() => {
      result.current.sendMessage('long research', { selectedSources: [], profile: 'support' })
    })
    first.push({ type: 'session_id', sessionId: 'sess-1' })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    act(() => {
      result.current.newChat()
    })
    act(() => {
      result.current.sendMessage('quick question', { selectedSources: [], profile: 'support' })
    })
    second.push({ type: 'session_id', sessionId: 'sess-2' })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-2'))

    act(() => {
      result.current.stopGeneration()
    })

    expect(signals[0].aborted).toBe(false)
    expect(signals[1].aborted).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.activeConversations).toEqual([
      { id: 'sess-2', title: 'quick question', isStreaming: false },
      { id: 'sess-1', title: 'long research', isStreaming: true },
    ])
  })

  it('opens the published artifact of the displayed conversation only', async () => {
    const first = createManualStream()
    const second = createManualStream()
    const streams = [first, second]
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(streams.shift().response))

    const onArtifactPublished = vi.fn()
    const { result } = renderHook(() => useChat('token', vi.fn(), onArtifactPublished))

    act(() => {
      result.current.sendMessage('build the runbook', { selectedSources: [], profile: 'support' })
    })
    first.push({ type: 'session_id', sessionId: 'sess-1' })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-1'))

    act(() => {
      result.current.newChat()
    })
    act(() => {
      result.current.sendMessage('and the incident report', { selectedSources: [], profile: 'support' })
    })
    second.push({ type: 'session_id', sessionId: 'sess-2' })
    await waitFor(() => expect(result.current.sessionId).toBe('sess-2'))

    first.push({ type: 'artifact', artifactId: 'art-1', title: 'Runbook', version: 1 })
    second.push({ type: 'artifact', artifactId: 'art-2', title: 'Incident report', version: 1 })

    await waitFor(() => expect(onArtifactPublished).toHaveBeenCalledTimes(1))
    expect(onArtifactPublished).toHaveBeenCalledWith({ artifactId: 'art-2', title: 'Incident report', version: 1 })
    expect(result.current.messages[1].parts).toEqual([
      { type: 'artifact', artifactId: 'art-2', title: 'Incident report', version: 1 },
    ])
  })

  it('adds the parts a guard leaves to the answer', async () => {
    const stream = createManualStream()
    global.fetch = vi.fn().mockResolvedValue(stream.response)
    const part = { type: 'guard-check', guard: 'Legal', warnings: 0, review: null, reason: 'off' }

    const { result } = renderHook(() => useChat('token', vi.fn()))
    act(() => {
      result.current.sendMessage('pass it through the Legal guard', { selectedSources: [], profile: 'support' })
    })
    stream.push({ type: 'part', part })

    await waitFor(() => expect(result.current.messages[1].parts).toEqual([part]))
  })

  describe('bot chats', () => {
    const GREETING = [{ role: 'assistant', parts: [{ type: 'text', content: 'Hi! I am Triager.' }] }]

    function botMessagesResponse(messages = GREETING) {
      return { ok: true, status: 200, json: async () => ({ messages }) }
    }

    it('shows a loading bot chat until its messages arrive', async () => {
      global.fetch = vi.fn().mockResolvedValue(botMessagesResponse())

      const { result } = renderHook(() => useChat('token', vi.fn(), undefined, 5))

      expect(result.current.isFetching).toBe(true)
      expect(result.current.messages).toEqual([])
      expect(result.current.conversationKey).toBe('bot-5')

      await act(async () => {
        await result.current.openBot(5)
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch.mock.calls[0][0]).toBe('/api/bots/5/messages')
      expect(result.current.isFetching).toBe(false)
      expect(result.current.messages).toEqual(GREETING)
    })

    it('sends the bot id with every message of a bot chat', async () => {
      global.fetch = vi.fn().mockImplementation(url => {
        if (String(url).includes('/api/bots/')) return Promise.resolve(botMessagesResponse())
        return Promise.resolve(createSSEResponse([{ type: 'session_id', sessionId: 'bot-conv' }, { type: 'done' }]))
      })

      const { result } = renderHook(() => useChat('token', vi.fn(), undefined, 5))
      await act(async () => {
        await result.current.openBot(5)
      })
      await act(async () => {
        await result.current.sendMessage('review the queue', { selectedSources: ['yolo'], profile: 'tech' })
      })

      const chatCall = global.fetch.mock.calls.find(([url]) => url === '/api/chat')
      const body = JSON.parse(chatCall[1].body)
      expect(body.botId).toBe(5)
      expect(body.message).toBe('review the queue')
      expect(body.selectedSources).toEqual(['yolo'])
      expect(body.profile).toBe('tech')
      expect(result.current.messages).toHaveLength(3)
    })

    it('never sends a bot id from a normal chat', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

      const { result } = renderHook(() => useChat('token', vi.fn()))
      await act(async () => {
        await result.current.sendMessage('hi', { selectedSources: [], profile: 'support' })
      })

      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).not.toHaveProperty('botId')
    })

    it('keeps bot chats out of the in-flight conversations', async () => {
      const stream = createManualStream()
      global.fetch = vi.fn().mockImplementation(url => {
        if (String(url).includes('/api/bots/')) return Promise.resolve(botMessagesResponse())
        return Promise.resolve(stream.response)
      })

      const { result } = renderHook(() => useChat('token', vi.fn(), undefined, 5))
      await act(async () => {
        await result.current.openBot(5)
      })
      act(() => {
        result.current.sendMessage('review the queue', { selectedSources: ['yolo'], profile: 'support' })
      })
      stream.push({ type: 'session_id', sessionId: 'bot-conv' })
      await waitFor(() => expect(result.current.sessionId).toBe('bot-conv'))

      expect(result.current.activeConversations).toEqual([])
    })

    it('keeps a bot answering while the user goes back to the normal chat', async () => {
      const stream = createManualStream()
      global.fetch = vi.fn().mockImplementation(url => {
        if (String(url).includes('/api/bots/')) return Promise.resolve(botMessagesResponse())
        return Promise.resolve(stream.response)
      })

      const { result, rerender } = renderHook(({ botId }) => useChat('token', vi.fn(), undefined, botId), {
        initialProps: { botId: 5 },
      })
      await act(async () => {
        await result.current.openBot(5)
      })
      act(() => {
        result.current.sendMessage('review the queue', { selectedSources: ['yolo'], profile: 'support' })
      })
      await waitFor(() => expect(result.current.isLoading).toBe(true))

      rerender({ botId: null })
      expect(result.current.conversationKey).toBe('chat-1')
      expect(result.current.messages).toEqual([])
      expect(result.current.isLoading).toBe(false)

      stream.push({ type: 'text_delta', text: 'Three new tickets.' })
      rerender({ botId: 5 })

      await waitFor(() =>
        expect(result.current.messages[2].parts).toEqual([{ type: 'text', content: 'Three new tickets.' }])
      )
      expect(result.current.isLoading).toBe(true)
    })

    it('lists the bots that are still answering while another bot is shown', async () => {
      const stream = createManualStream()
      global.fetch = vi.fn().mockImplementation(url => {
        if (String(url).includes('/api/bots/')) return Promise.resolve(botMessagesResponse())
        return Promise.resolve(stream.response)
      })

      const { result, rerender } = renderHook(({ botId }) => useChat('token', vi.fn(), undefined, botId), {
        initialProps: { botId: 5 },
      })
      await act(async () => {
        await result.current.openBot(5)
      })

      expect(result.current.busyBotIds).toEqual([])

      act(() => {
        result.current.sendMessage('review the queue', { selectedSources: ['yolo'], profile: 'support' })
      })
      await waitFor(() => expect(result.current.busyBotIds).toEqual([5]))

      rerender({ botId: 6 })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.busyBotIds).toEqual([5])

      stream.push({ type: 'done' })
      stream.close()

      await waitFor(() => expect(result.current.busyBotIds).toEqual([]))
    })

    it('leaves a streaming bot chat as it is when the bot is opened again', async () => {
      const stream = createManualStream()
      global.fetch = vi.fn().mockImplementation(url => {
        if (String(url).includes('/api/bots/')) return Promise.resolve(botMessagesResponse())
        return Promise.resolve(stream.response)
      })

      const { result } = renderHook(() => useChat('token', vi.fn(), undefined, 5))
      await act(async () => {
        await result.current.openBot(5)
      })
      act(() => {
        result.current.sendMessage('review the queue', { selectedSources: ['yolo'], profile: 'support' })
      })
      await waitFor(() => expect(result.current.isLoading).toBe(true))

      await act(async () => {
        await result.current.openBot(5)
        await result.current.refreshBot(5)
      })

      expect(global.fetch.mock.calls.filter(([url]) => url === '/api/bots/5/messages')).toHaveLength(1)
      expect(result.current.messages).toHaveLength(3)
    })

    it('reloads an idle bot chat on refresh', async () => {
      const routineResult = { role: 'assistant', parts: [{ type: 'routine', routineId: 9, title: 'Queue review' }] }
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(botMessagesResponse())
        .mockResolvedValue(botMessagesResponse([...GREETING, routineResult]))

      const { result } = renderHook(() => useChat('token', vi.fn(), undefined, 5))
      await act(async () => {
        await result.current.openBot(5)
      })
      await act(async () => {
        await result.current.refreshBot(5)
      })

      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(result.current.messages).toEqual([...GREETING, routineResult])
    })

    it('does nothing when refreshing a bot that was never opened', async () => {
      global.fetch = vi.fn()

      const { result } = renderHook(() => useChat('token', vi.fn()))
      await act(async () => {
        await result.current.refreshBot(5)
      })

      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('exposes why the bot chat could not be loaded', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Bot not found.' }) })

      const { result } = renderHook(() => useChat('token', vi.fn(), undefined, 5))
      await act(async () => {
        await result.current.openBot(5)
      })

      expect(result.current.isFetching).toBe(false)
      expect(result.current.fetchError).toBe('Bot not found.')
    })

    it('logs out when the bot chat answers 401', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
      const onAuthError = vi.fn()

      const { result } = renderHook(() => useChat('token', onAuthError, undefined, 5))
      await act(async () => {
        await result.current.openBot(5)
      })

      expect(onAuthError).toHaveBeenCalledTimes(1)
      expect(result.current.fetchError).toBeNull()
    })

    it('keeps the turn the user started while the bot chat was still loading', async () => {
      let resolveMessages
      global.fetch = vi.fn().mockImplementation(url => {
        if (String(url).includes('/api/bots/')) return new Promise(resolve => (resolveMessages = resolve))
        return Promise.resolve(createManualStream().response)
      })

      const { result } = renderHook(() => useChat('token', vi.fn(), undefined, 5))
      let opening
      act(() => {
        opening = result.current.openBot(5)
      })
      act(() => {
        result.current.sendMessage('quick one', { selectedSources: ['yolo'], profile: 'support' })
      })
      await waitFor(() => expect(result.current.isLoading).toBe(true))

      resolveMessages(botMessagesResponse())
      await act(async () => {
        await opening
      })

      expect(result.current.messages[0]).toEqual({ role: 'user', content: 'quick one' })
      expect(result.current.isFetching).toBe(false)
    })
  })
})
