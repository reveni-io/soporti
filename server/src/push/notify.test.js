import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../db/push-subscriptions.js', () => ({ listPushSubscriptions: vi.fn(), deletePushSubscription: vi.fn() }))
vi.mock('./client.js', () => ({ sendPushMessage: vi.fn() }))

const { listPushSubscriptions, deletePushSubscription } = await import('../db/push-subscriptions.js')
const { sendPushMessage } = await import('./client.js')
const { notifyUser, notifySubscriptions, botTarget, conversationTarget, videoTarget } = await import('./notify.js')

const PHONE = { endpoint: 'https://fcm.googleapis.com/fcm/send/phone-token', p256dh: 'BPhone', auth: 'phone-auth' }
const LAPTOP = {
  endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/laptop-token',
  p256dh: 'BLaptop',
  auth: 'laptop-auth',
}
const MESSAGE = { title: 'Sales bot', body: 'Three refunds since yesterday.', url: '/bots/12', tag: 'bot-12' }

beforeEach(() => {
  vi.clearAllMocks()
  listPushSubscriptions.mockResolvedValue([PHONE, LAPTOP])
  sendPushMessage.mockResolvedValue({ outcome: 'delivered', status: 201 })
  deletePushSubscription.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('notification targets', () => {
  it('opens the bot chat for a bot', () => {
    expect(botTarget(12)).toEqual({ url: '/bots/12', tag: 'bot-12' })
  })

  it('opens the conversation in the chat for a conversation', () => {
    expect(conversationTarget('11111111-1111-4111-8111-111111111111')).toEqual({
      url: '/chat?conversation=11111111-1111-4111-8111-111111111111',
      tag: 'conversation-11111111-1111-4111-8111-111111111111',
    })
  })

  it('opens the video for a video', () => {
    expect(videoTarget('3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601')).toEqual({
      url: '/videos/3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601',
      tag: 'video-3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601',
    })
  })
})

describe('notifyUser', () => {
  it('sends the message to every device of the user and returns how many got it', async () => {
    expect(await notifyUser(7, MESSAGE)).toBe(2)

    expect(listPushSubscriptions).toHaveBeenCalledWith(7)
    expect(sendPushMessage).toHaveBeenCalledTimes(2)
    expect(sendPushMessage).toHaveBeenCalledWith(PHONE, MESSAGE)
    expect(sendPushMessage).toHaveBeenCalledWith(LAPTOP, MESSAGE)
  })

  it('does nothing when the user has no device subscribed', async () => {
    listPushSubscriptions.mockResolvedValue([])

    expect(await notifyUser(7, MESSAGE)).toBe(0)
    expect(sendPushMessage).not.toHaveBeenCalled()
  })

  it('turns the markdown body into plain text and cuts title and body with an ellipsis', async () => {
    await notifyUser(7, {
      ...MESSAGE,
      title: `**${'T'.repeat(100)}**`,
      body: `## Report\n\n**Three** refunds:\n\n- order [1001](https://shop.example.com/1001)\n\n${'y'.repeat(300)}`,
    })

    const [, payload] = sendPushMessage.mock.calls[0]
    expect(payload.title).toHaveLength(80)
    expect(payload.title.endsWith('…')).toBe(true)
    expect(payload.body).toHaveLength(180)
    expect(payload.body.startsWith('Report Three refunds: order 1001 yyy')).toBe(true)
    expect(payload.body.endsWith('…')).toBe(true)
    expect(payload).toMatchObject({ url: '/bots/12', tag: 'bot-12' })
  })

  it('redacts the secrets of the body, even the ones markdown would have mangled', async () => {
    await notifyUser(7, {
      ...MESSAGE,
      body: 'Use **ghp_abcdefghijklmnopqrstuvwxyz0123** or github_pat_abcdefghij_klmnopqrstuvwxyz',
    })

    const [, payload] = sendPushMessage.mock.calls[0]
    expect(payload.body).toBe('Use [redacted] or [redacted]')
  })

  it('deletes the subscriptions the push service says are gone and counts only the deliveries', async () => {
    sendPushMessage.mockImplementation(async subscription => {
      return subscription === PHONE ? { outcome: 'gone', status: 410 } : { outcome: 'delivered', status: 201 }
    })

    expect(await notifyUser(7, MESSAGE)).toBe(1)

    expect(deletePushSubscription).toHaveBeenCalledTimes(1)
    expect(deletePushSubscription).toHaveBeenCalledWith(PHONE.endpoint)
  })

  it('logs a refused notification with the push service host and never the endpoint', async () => {
    sendPushMessage.mockImplementation(async subscription => {
      return subscription === PHONE ? { outcome: 'failed', status: 429 } : { outcome: 'delivered', status: 201 }
    })

    expect(await notifyUser(7, MESSAGE)).toBe(1)

    expect(deletePushSubscription).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith('[push] fcm.googleapis.com refused a notification with status 429.')
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('phone-token')
  })

  it('logs a failed request with the push service host and still delivers to the other devices', async () => {
    sendPushMessage.mockImplementation(async subscription => {
      if (subscription === LAPTOP) throw new Error('The operation was aborted due to timeout')
      return { outcome: 'delivered', status: 201 }
    })

    expect(await notifyUser(7, MESSAGE)).toBe(1)

    expect(console.error).toHaveBeenCalledWith(
      '[push] Failed to send a notification through updates.push.services.mozilla.com:',
      'The operation was aborted due to timeout'
    )
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('laptop-token')
  })

  it('logs and goes on when a gone subscription cannot be deleted', async () => {
    sendPushMessage.mockResolvedValue({ outcome: 'gone', status: 404 })
    deletePushSubscription.mockRejectedValue(new Error('db down'))

    expect(await notifyUser(7, MESSAGE)).toBe(0)

    expect(deletePushSubscription).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalledWith('[push] Failed to delete a gone subscription:', 'db down')
  })

  it('never throws, and logs, when the subscriptions cannot be loaded', async () => {
    const failure = new Error('db down')
    listPushSubscriptions.mockRejectedValue(failure)

    expect(await notifyUser(7, MESSAGE)).toBe(0)

    expect(sendPushMessage).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('[push] Failed to notify a user:', failure)
  })
})

describe('notifySubscriptions', () => {
  it('sends the message to the given subscriptions only', async () => {
    expect(await notifySubscriptions([LAPTOP], MESSAGE)).toBe(1)

    expect(listPushSubscriptions).not.toHaveBeenCalled()
    expect(sendPushMessage).toHaveBeenCalledTimes(1)
    expect(sendPushMessage).toHaveBeenCalledWith(LAPTOP, MESSAGE)
  })
})
