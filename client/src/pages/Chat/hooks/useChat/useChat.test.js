import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
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
      await result.current.sendMessage('hi', ['org/repo'], 'support')
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
      await result.current.sendMessage('hi', ['org/repo'], 'support', [{ id: 5, name: 'bug-triage' }])
    })

    expect(result.current.messages[0]).toEqual({
      role: 'user',
      content: 'hi',
      skills: [{ id: 5, name: 'bug-triage' }],
    })
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).skillIds).toEqual([5])
    expect(JSON.parse(options.body).message).toBe('hi')
  })

  it('defaults skillIds to an empty array when omitted', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(createSSEResponse([{ type: 'session_id', sessionId: 'sess-1' }, { type: 'done' }]))

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('hi', ['org/repo'], 'support')
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
      await result.current.sendMessage(
        'summarize it',
        ['org/repo'],
        'support',
        [],
        [{ name: 'spec.pdf', text: 'The API returns 402.', truncated: true }]
      )
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
      await result.current.sendMessage(
        'what is this?',
        ['org/repo'],
        'support',
        [],
        [{ name: 'error.png', imageId, previewUrl: 'blob:local' }]
      )
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
      await result.current.sendMessage('hi', ['org/repo'], 'support')
    })

    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'hi' })
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).attachments).toEqual([])
  })

  it('does not send empty messages', async () => {
    global.fetch = vi.fn()
    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('   ', [], 'support')
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
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
      await result.current.sendMessage('find auth', [], 'tech')
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
      await result.current.sendMessage('test', [], 'support')
    })

    const parts = result.current.messages[1].parts
    expect(parts.some(p => p.type === 'error' && p.content === 'Something went wrong')).toBe(true)
  })

  it('calls onAuthError on 401 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    const onAuthError = vi.fn()
    const { result } = renderHook(() => useChat('token', onAuthError))

    await act(async () => {
      await result.current.sendMessage('hi', [], 'support')
    })

    expect(onAuthError).toHaveBeenCalled()
  })

  it('clearChat resets messages', async () => {
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
      await result.current.sendMessage('hi', [], 'support')
    })
    expect(result.current.messages.length).toBe(2)

    act(() => {
      result.current.clearChat()
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

  it('advances the conversation key when a conversation is loaded or cleared', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages: [] }) })

    const { result } = renderHook(() => useChat('token', vi.fn()))
    const initialKey = result.current.conversationKey

    await act(async () => {
      await result.current.loadConversation('conv-1')
    })
    const loadedKey = result.current.conversationKey

    act(() => {
      result.current.clearChat()
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

  it('handles HTTP error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    })

    const { result } = renderHook(() => useChat('token', vi.fn()))

    await act(async () => {
      await result.current.sendMessage('test', [], 'support')
    })

    const parts = result.current.messages[1].parts
    expect(parts.some(p => p.type === 'error')).toBe(true)
  })
})
