import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { createAnswer, notifyAnswerReady, trackAnswer } from './answer-notification.js'

const SESSION_ID = '0b6f5c1e-8f4a-4d2b-9c3e-2a1b0c9d8e7f'

function stubDevice() {
  const registration = {
    pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://push.example/1' }) },
    showNotification: vi.fn().mockResolvedValue(),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: vi.fn().mockResolvedValue(registration) },
    configurable: true,
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', { permission: 'granted' })

  return registration
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

function streamed(answer, events) {
  events.forEach(event => trackAnswer(answer, event))
  return answer
}

beforeEach(() => {
  setVisibility('hidden')
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete navigator.serviceWorker
  delete document.visibilityState
})

describe('answer-notification', () => {
  it('tells a user who left the page that the answer is ready, with a link to the conversation', async () => {
    const registration = stubDevice()
    const answer = streamed(createAnswer({ sessionId: null, botId: undefined }), [
      { type: 'session_id', sessionId: SESSION_ID },
      { type: 'text_delta', text: 'Let me check the refunds.' },
      { type: 'tool_start', tool: 'query_database' },
      { type: 'tool_end', tool: 'query_database' },
      { type: 'text_delta', text: 'Refunds over **€500** ' },
      { type: 'text_delta', text: 'need a second approval.' },
      { type: 'done' },
    ])

    notifyAnswerReady(answer)

    await waitFor(() => expect(registration.showNotification).toHaveBeenCalledTimes(1))
    expect(registration.showNotification).toHaveBeenCalledWith('Your answer is ready', {
      body: 'Refunds over €500 need a second approval.',
      tag: `conversation-${SESSION_ID}`,
      data: { url: `/chat?conversation=${SESSION_ID}` },
      icon: '/icon-192.png',
      badge: '/badge-96.png',
    })
  })

  it('links the answer of a bot to the chat of that bot', async () => {
    const registration = stubDevice()
    const answer = streamed(createAnswer({ sessionId: SESSION_ID, botId: 12 }), [
      { type: 'text_delta', text: 'Three refunds failed overnight.' },
      { type: 'done' },
    ])

    notifyAnswerReady(answer)

    await waitFor(() => expect(registration.showNotification).toHaveBeenCalledTimes(1))
    const [, options] = registration.showNotification.mock.calls[0]
    expect(options.tag).toBe('bot-12')
    expect(options.data).toEqual({ url: '/bots/12' })
  })

  it('keeps the excerpt within 180 characters', async () => {
    const registration = stubDevice()
    const answer = streamed(createAnswer({ sessionId: SESSION_ID }), [
      { type: 'text_delta', text: 'word '.repeat(100) },
      { type: 'done' },
    ])

    notifyAnswerReady(answer)

    await waitFor(() => expect(registration.showNotification).toHaveBeenCalledTimes(1))
    const [, options] = registration.showNotification.mock.calls[0]
    expect(options.body.length).toBeLessThanOrEqual(180)
    expect(options.body.endsWith('…')).toBe(true)
  })

  it('keeps the text written before the last tool when the answer ends with a tool call', async () => {
    const registration = stubDevice()
    const answer = streamed(createAnswer({ sessionId: SESSION_ID }), [
      { type: 'text_delta', text: 'Here is the chart.' },
      { type: 'tool_start', tool: 'publish_artifact' },
      { type: 'done' },
    ])

    notifyAnswerReady(answer)

    await waitFor(() => expect(registration.showNotification).toHaveBeenCalledTimes(1))
    expect(registration.showNotification.mock.calls[0][1].body).toBe('Here is the chart.')
  })

  it('stays quiet while the user is looking at the page', async () => {
    const registration = stubDevice()
    setVisibility('visible')
    const answer = streamed(createAnswer({ sessionId: SESSION_ID }), [
      { type: 'text_delta', text: 'Done.' },
      { type: 'done' },
    ])

    notifyAnswerReady(answer)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(registration.showNotification).not.toHaveBeenCalled()
  })

  it('stays quiet when the answer ended with an error', async () => {
    const registration = stubDevice()
    const answer = streamed(createAnswer({ sessionId: SESSION_ID }), [
      { type: 'error', message: 'An internal error occurred.' },
      { type: 'done' },
    ])

    notifyAnswerReady(answer)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(registration.showNotification).not.toHaveBeenCalled()
  })

  it('stays quiet when the stream stopped before the answer was done', async () => {
    const registration = stubDevice()
    const answer = streamed(createAnswer({ sessionId: SESSION_ID }), [{ type: 'text_delta', text: 'Half an' }])

    notifyAnswerReady(answer)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(registration.showNotification).not.toHaveBeenCalled()
  })
})
