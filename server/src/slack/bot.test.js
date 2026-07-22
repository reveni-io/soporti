import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let registeredEventHandlers = {}
let registeredActionHandlers = {}
let registeredCommandHandlers = {}
let _mockAppInstance = null

vi.mock('@slack/bolt', () => ({
  default: {
    App: class MockApp {
      constructor(opts) {
        this._opts = opts
        _mockAppInstance = this
      }
      event(name, handler) {
        registeredEventHandlers[name] = handler
      }
      action(name, handler) {
        registeredActionHandlers[name] = handler
      }
      command(name, handler) {
        registeredCommandHandlers[name] = handler
      }
      async start() {}
      async stop() {}
    },
    LogLevel: { WARN: 'warn' },
  },
}))

vi.mock('../config.js', () => ({
  default: {
    // The Slack tokens live in the DB now (see ./settings.js mock below).
    notion: {},
    postgres: {},
    sentry: {},
    github: { token: 'test' },
  },
}))

// Slack credentials resolved from the database. Mutable so a test can simulate
// "not configured" without touching module internals.
const slackSettingsState = vi.hoisted(() => ({
  current: { botToken: 'xoxb-test', appToken: 'xapp-test', signingSecret: 'secret' },
}))

vi.mock('./settings.js', () => ({
  getSlackSettings: vi.fn(async () => slackSettingsState.current),
  getSlackBotToken: vi.fn(async () => slackSettingsState.current.botToken || null),
  isSlackConfigured: vi.fn(async () =>
    Boolean(slackSettingsState.current.botToken && slackSettingsState.current.appToken)
  ),
}))

vi.mock('../github/client.js', () => ({
  listRepos: vi.fn(),
}))

vi.mock('../notion/client.js', () => ({
  isConfigured: vi.fn(() => false),
}))

vi.mock('../postgres/client.js', () => ({
  isConfigured: vi.fn(() => false),
}))

vi.mock('../helpjuice/client.js', () => ({
  isConfigured: vi.fn(() => false),
}))

vi.mock('../shopify/client.js', () => ({
  isConfigured: vi.fn(() => false),
}))

vi.mock('../google-drive/client.js', () => ({
  isConfigured: vi.fn(() => false),
}))

vi.mock('./handler.js', () => ({
  processMessage: vi.fn(),
}))

vi.mock('./auto-diagnose-poller.js', () => ({
  startAutoDiagnose: vi.fn(),
  stopAutoDiagnose: vi.fn(),
}))

vi.mock('./formatter.js', () => ({
  markdownToSlack: vi.fn(text => text),
  splitMessage: vi.fn(text => [text]),
}))

vi.mock('../knowledge/feedback.js', () => ({
  storePendingFeedback: vi.fn(() => 'feedback-1'),
  processFeedback: vi.fn(),
}))

vi.mock('../knowledge/client.js', () => ({
  isKnowledgeBaseConfigured: vi.fn(async () => true),
}))

vi.mock('../agent/system-prompt.js', () => ({
  DEFAULT_PROFILE: 'support',
}))

vi.mock('../db/users.js', () => ({
  upsertSlackUser: vi.fn(async ({ slackId, name }) => ({ id: 7, slackId, name: name ?? null })),
  getCustomInstructions: vi.fn(async () => null),
  updateCustomInstructions: vi.fn(async (_userId, value) => (value && value.trim().length > 0 ? value : null)),
}))

const { listRepos } = await import('../github/client.js')
const { processMessage } = await import('./handler.js')
const { isKnowledgeBaseConfigured } = await import('../knowledge/client.js')

function buildMockClient() {
  return {
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ts: 'msg-ts' }),
      update: vi.fn().mockResolvedValue({}),
      postEphemeral: vi.fn().mockResolvedValue({}),
    },
    filesUploadV2: vi.fn().mockResolvedValue({}),
    conversations: {
      replies: vi.fn().mockResolvedValue({ messages: [] }),
    },
  }
}

function buildMockConversationStore() {
  return {
    resolveSlack: vi.fn(async () => ({
      conversationId: 'conv-1',
      session: { id: 'sess-1' },
      previousResponseId: undefined,
    })),
    saveTurn: vi.fn(async () => {}),
  }
}

describe('Slack bot', () => {
  let isSlackConfigured, startSlackBot, stopSlackBot, restartSlackBot

  beforeEach(async () => {
    vi.clearAllMocks()
    registeredEventHandlers = {}
    registeredActionHandlers = {}
    registeredCommandHandlers = {}
    _mockAppInstance = null
    slackSettingsState.current = { botToken: 'xoxb-test', appToken: 'xapp-test', signingSecret: 'secret' }

    const mod = await import('./bot.js')
    isSlackConfigured = mod.isSlackConfigured
    startSlackBot = mod.startSlackBot
    stopSlackBot = mod.stopSlackBot
    restartSlackBot = mod.restartSlackBot
  })

  afterEach(async () => {
    try {
      await stopSlackBot()
    } catch {}
  })

  describe('isSlackConfigured', () => {
    it('returns true when both tokens are set', async () => {
      expect(await isSlackConfigured()).toBe(true)
    })
  })

  describe('startSlackBot', () => {
    it('creates app and starts socket mode', async () => {
      const app = await startSlackBot(buildMockConversationStore())
      expect(app).not.toBeNull()
      expect(registeredEventHandlers).toHaveProperty('app_mention')
      expect(registeredEventHandlers).toHaveProperty('message')
      expect(registeredActionHandlers).toHaveProperty('confirm_selection')
      expect(registeredActionHandlers).toHaveProperty('select_profile')
      expect(registeredActionHandlers).toHaveProperty('select_sources')
    })

    it('returns null when not configured', async () => {
      slackSettingsState.current = { botToken: '', appToken: '', signingSecret: '' }

      const result = await startSlackBot(buildMockConversationStore())
      expect(result).toBeNull()
    })

    it('reuses the running app instead of opening a second connection', async () => {
      const first = await startSlackBot(buildMockConversationStore())
      const second = await startSlackBot(buildMockConversationStore())
      expect(second).toBe(first)
    })
  })

  describe('stopSlackBot', () => {
    it('stops the running app', async () => {
      await startSlackBot(buildMockConversationStore())
      await stopSlackBot()
    })

    it('does nothing when no app is running', async () => {
      await stopSlackBot()
    })
  })

  describe('restartSlackBot', () => {
    it('reconnects with the current credentials, reusing the stored store', async () => {
      await startSlackBot(buildMockConversationStore())
      const restarted = await restartSlackBot()
      expect(restarted).not.toBeNull()
    })

    it('disconnects when the credentials have been cleared', async () => {
      await startSlackBot(buildMockConversationStore())
      slackSettingsState.current = { botToken: '', appToken: '', signingSecret: '' }
      const restarted = await restartSlackBot()
      expect(restarted).toBeNull()
    })
  })

  describe('app_mention handler', () => {
    let mockClient

    beforeEach(async () => {
      mockClient = buildMockClient()
      await startSlackBot(buildMockConversationStore())
    })

    it('sends help message when mention is empty', async () => {
      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT>', ts: 'ev-ts', channel: 'C123' },
        client: mockClient,
      })

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123',
          text: expect.stringContaining('Mention me with a question'),
        })
      )
    })

    it('shows source selector on first mention with repos', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> what is this?', ts: 'ev-ts', channel: 'C123' },
        client: mockClient,
      })

      expect(listRepos).toHaveBeenCalled()
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'C123',
          blocks: expect.any(Array),
          text: 'Select sources and profile to continue.',
        })
      )
    })

    it('skips selector on follow-up in thread with existing sources', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])
      processMessage.mockResolvedValue({ text: 'Agent response' })

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> initial question', ts: 'thread-ts', channel: 'C123' },
        client: mockClient,
      })

      const confirmBody = {
        message: { ts: 'msg-ts' },
        channel: { id: 'C123' },
        user: { id: 'U456' },
      }
      await registeredActionHandlers['select_sources']({
        action: { selected_options: [{ value: 'org/repo1' }] },
        body: { message: { ts: 'msg-ts' } },
        ack: vi.fn(),
      })

      await registeredActionHandlers['confirm_selection']({
        body: confirmBody,
        client: mockClient,
        ack: vi.fn(),
      })

      mockClient.chat.postMessage.mockClear()
      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> follow up', ts: 'ev-ts-2', thread_ts: 'thread-ts', channel: 'C123' },
        client: mockClient,
      })

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: ':hourglass_flipping_sand: _Thinking..._',
        })
      )
    })

    it('sends error when no repos found', async () => {
      listRepos.mockResolvedValue([])

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> hello', ts: 'ev-ts', channel: 'C123' },
        client: mockClient,
      })

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('No repositories found'),
        })
      )
    })

    it('includes integration source options when integrations are configured', async () => {
      const notion = await import('../notion/client.js')
      const postgres = await import('../postgres/client.js')
      const helpjuice = await import('../helpjuice/client.js')
      const shopify = await import('../shopify/client.js')
      const googleDrive = await import('../google-drive/client.js')

      notion.isConfigured.mockReturnValue(true)
      postgres.isConfigured.mockReturnValue(true)
      helpjuice.isConfigured.mockReturnValue(true)
      shopify.isConfigured.mockReturnValue(true)
      googleDrive.isConfigured.mockReturnValue(true)

      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> hello', ts: 'ev-ts', channel: 'C123' },
        client: mockClient,
      })

      const callArg = mockClient.chat.postMessage.mock.calls.find(call =>
        (call[0]?.blocks || []).some(b => b.accessory?.options?.some(o => o.value === 'integration:notion'))
      )
      expect(callArg).toBeTruthy()

      const blocks = callArg[0].blocks
      const sourceSelect = blocks.find(b => b.accessory?.action_id === 'select_sources')
      const values = sourceSelect.accessory.options.map(o => o.value)

      expect(values).toContain('integration:notion')
      expect(values).toContain('integration:postgres')
      expect(values).toContain('integration:helpjuice')
      expect(values).toContain('integration:shopify')
      expect(values).toContain('integration:google-drive')
    })

    it('omits integration source options when their integrations are not configured', async () => {
      const notion = await import('../notion/client.js')
      const googleDrive = await import('../google-drive/client.js')
      notion.isConfigured.mockReturnValue(false)
      googleDrive.isConfigured.mockReturnValue(false)

      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> hello', ts: 'ev-ts', channel: 'C123' },
        client: mockClient,
      })

      const callArg = mockClient.chat.postMessage.mock.calls.find(call =>
        (call[0]?.blocks || []).some(b => b.accessory?.action_id === 'select_sources')
      )
      expect(callArg).toBeTruthy()

      const blocks = callArg[0].blocks
      const sourceSelect = blocks.find(b => b.accessory?.action_id === 'select_sources')
      const values = sourceSelect.accessory.options.map(o => o.value)

      expect(values).not.toContain('integration:notion')
      expect(values).not.toContain('integration:google-drive')
    })

    it('adds thread context into the question sent to processMessage', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])

      mockClient.conversations.replies.mockResolvedValue({
        messages: [
          { ts: 'ev-ts-2', text: 'should be filtered out' },
          { ts: 'other', text: 'context line' },
        ],
      })

      processMessage.mockResolvedValue({ text: 'Agent response' })

      await registeredEventHandlers['app_mention']({
        event: {
          text: '<@U123BOT> follow question',
          ts: 'ev-ts-2',
          thread_ts: 'thread-ts',
          channel: 'C123',
          user: 'U1',
        },
        client: mockClient,
      })

      // Select a source + confirm selection to trigger runAndReply/processMessage.
      await registeredActionHandlers['select_sources']({
        action: { selected_options: [{ value: 'org/repo1' }] },
        body: { message: { ts: 'msg-ts' } },
        ack: vi.fn(),
      })

      await registeredActionHandlers['confirm_selection']({
        body: { message: { ts: 'msg-ts' }, channel: { id: 'C123' }, user: { id: 'U456' } },
        client: mockClient,
        ack: vi.fn(),
      })

      const processCall = processMessage.mock.calls[0][0]
      expect(processCall.message).toContain('Thread context — previous messages in this thread')
      expect(processCall.message).toContain('context line')
      expect(processCall.message).toContain('follow question')
    })
  })

  describe('confirm_selection handler', () => {
    let mockClient

    beforeEach(async () => {
      mockClient = buildMockClient()
      await startSlackBot(buildMockConversationStore())
    })

    it('sends error when pending question not found', async () => {
      await registeredActionHandlers['confirm_selection']({
        body: {
          message: { ts: 'unknown-ts' },
          channel: { id: 'C123' },
          user: { id: 'U456' },
        },
        client: mockClient,
        ack: vi.fn(),
      })

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('expired'),
        })
      )
    })

    it('sends ephemeral when no sources selected', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])

      const msgTs = 'msg-ts-ephemeral-unique'
      mockClient.chat.postMessage.mockResolvedValueOnce({ ts: msgTs })

      const threadTs = 'ev-ts-ephemeral-thread-unique'
      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> test question', ts: threadTs, channel: 'C123' },
        client: mockClient,
      })

      // force the status to "no sources" if there is a previous state in the module map.
      await registeredActionHandlers['select_sources']({
        action: { selected_options: [] },
        body: { message: { ts: msgTs } },
        ack: vi.fn(),
      })

      await registeredActionHandlers['confirm_selection']({
        body: {
          message: { ts: msgTs },
          channel: { id: 'C123' },
          user: { id: 'U456' },
        },
        client: mockClient,
        ack: vi.fn(),
      })

      expect(mockClient.chat.postEphemeral).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Please select at least one source.',
        })
      )
    })

    it('runs agent on successful selection', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])
      processMessage.mockResolvedValue({ text: 'Agent response' })

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> test question', ts: 'ev-ts', channel: 'C123' },
        client: mockClient,
      })

      await registeredActionHandlers['select_sources']({
        action: { selected_options: [{ value: 'org/repo1' }] },
        body: { message: { ts: 'msg-ts' } },
        ack: vi.fn(),
      })

      await registeredActionHandlers['confirm_selection']({
        body: {
          message: { ts: 'msg-ts' },
          channel: { id: 'C123' },
          user: { id: 'U456' },
        },
        client: mockClient,
        ack: vi.fn(),
      })

      expect(mockClient.chat.update).toHaveBeenCalled()
      expect(processMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.any(String),
          selectedSources: ['org/repo1'],
          profile: 'support',
        })
      )
      // Knowledge base configured → the 👍/👎 feedback prompt is posted.
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'Was this helpful?' }))
    })

    it('omits the feedback prompt when the knowledge base is not configured', async () => {
      isKnowledgeBaseConfigured.mockResolvedValueOnce(false)
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])
      processMessage.mockResolvedValue({ text: 'Agent response' })

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> test question', ts: 'ev-ts', channel: 'C123' },
        client: mockClient,
      })
      await registeredActionHandlers['select_sources']({
        action: { selected_options: [{ value: 'org/repo1' }] },
        body: { message: { ts: 'msg-ts' } },
        ack: vi.fn(),
      })
      await registeredActionHandlers['confirm_selection']({
        body: { message: { ts: 'msg-ts' }, channel: { id: 'C123' }, user: { id: 'U456' } },
        client: mockClient,
        ack: vi.fn(),
      })

      expect(mockClient.chat.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Was this helpful?' })
      )
    })

    it('uploads as file when response is too long for Slack messages', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])
      processMessage.mockResolvedValue({ text: 'a'.repeat(5001) })

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> test question', ts: 'ev-ts', channel: 'C123', user: 'U1' },
        client: mockClient,
      })

      await registeredActionHandlers['select_sources']({
        action: { selected_options: [{ value: 'org/repo1' }] },
        body: { message: { ts: 'msg-ts' } },
        ack: vi.fn(),
      })

      await registeredActionHandlers['confirm_selection']({
        body: { message: { ts: 'msg-ts' }, channel: { id: 'C123' }, user: { id: 'U456' } },
        client: mockClient,
        ack: vi.fn(),
      })

      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '_Response was too long for a message. Uploading as file..._',
        })
      )
      expect(mockClient.filesUploadV2).toHaveBeenCalled()
    })

    it('shows an error message when processMessage throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])
      processMessage.mockRejectedValue(new Error('agent boom'))

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> test question', ts: 'ev-ts', channel: 'C123', user: 'U1' },
        client: mockClient,
      })

      await registeredActionHandlers['select_sources']({
        action: { selected_options: [{ value: 'org/repo1' }] },
        body: { message: { ts: 'msg-ts' } },
        ack: vi.fn(),
      })

      await registeredActionHandlers['confirm_selection']({
        body: { message: { ts: 'msg-ts' }, channel: { id: 'C123' }, user: { id: 'U456' } },
        client: mockClient,
        ack: vi.fn(),
      })

      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '⚠️ An error occurred while processing your request.',
        })
      )
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('select_profile action handler', () => {
    let mockClient

    beforeEach(async () => {
      mockClient = buildMockClient()
      await startSlackBot(buildMockConversationStore())
    })

    it('saves selected profile to pending question', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> test question', ts: 'ev-ts', channel: 'C123' },
        client: mockClient,
      })

      const ack = vi.fn()
      await registeredActionHandlers['select_profile']({
        action: { selected_option: { value: 'tech' } },
        body: { message: { ts: 'msg-ts' } },
        ack,
      })

      expect(ack).toHaveBeenCalled()
    })
  })

  describe('select_sources action handler', () => {
    let mockClient

    beforeEach(async () => {
      mockClient = buildMockClient()
      await startSlackBot(buildMockConversationStore())
    })

    it('saves selected sources to pending question', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])

      await registeredEventHandlers['app_mention']({
        event: { text: '<@U123BOT> test question', ts: 'ev-ts', channel: 'C123' },
        client: mockClient,
      })

      const ack = vi.fn()
      await registeredActionHandlers['select_sources']({
        action: { selected_options: [{ value: 'org/repo1' }, { value: 'integration:notion' }] },
        body: { message: { ts: 'msg-ts' } },
        ack,
      })

      expect(ack).toHaveBeenCalled()
    })
  })

  describe('message event handler (DM)', () => {
    let mockClient

    beforeEach(async () => {
      mockClient = buildMockClient()
      await startSlackBot(buildMockConversationStore())
    })

    it('shows source selector for first DM', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])

      await registeredEventHandlers['message']({
        event: {
          text: 'Hello bot',
          ts: 'dm-ts',
          channel: 'D123',
          channel_type: 'im',
        },
        client: mockClient,
      })

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'D123',
          blocks: expect.any(Array),
        })
      )
    })

    it('ignores non-DM messages', async () => {
      await registeredEventHandlers['message']({
        event: {
          text: 'Not a DM',
          ts: 'ev-ts',
          channel: 'C123',
          channel_type: 'channel',
        },
        client: mockClient,
      })

      expect(mockClient.chat.postMessage).not.toHaveBeenCalled()
    })

    it('ignores bot messages', async () => {
      await registeredEventHandlers['message']({
        event: {
          text: 'Bot self message',
          ts: 'ev-ts',
          channel: 'D123',
          channel_type: 'im',
          bot_id: 'B123',
        },
        client: mockClient,
      })

      expect(mockClient.chat.postMessage).not.toHaveBeenCalled()
    })

    it('ignores messages with subtypes', async () => {
      await registeredEventHandlers['message']({
        event: {
          text: 'Subtype message',
          ts: 'ev-ts',
          channel: 'D123',
          channel_type: 'im',
          subtype: 'message_changed',
        },
        client: mockClient,
      })

      expect(mockClient.chat.postMessage).not.toHaveBeenCalled()
    })

    it('processes DM with existing sources', async () => {
      listRepos.mockResolvedValue([{ fullName: 'org/repo1' }])
      processMessage.mockResolvedValue({ text: 'Agent response' })

      await registeredEventHandlers['message']({
        event: {
          text: 'First question',
          ts: 'dm-thread-ts',
          channel: 'D123',
          channel_type: 'im',
        },
        client: mockClient,
      })

      await registeredActionHandlers['select_sources']({
        action: { selected_options: [{ value: 'org/repo1' }] },
        body: { message: { ts: 'msg-ts' } },
        ack: vi.fn(),
      })

      await registeredActionHandlers['confirm_selection']({
        body: {
          message: { ts: 'msg-ts' },
          channel: { id: 'D123' },
          user: { id: 'U456' },
        },
        client: mockClient,
        ack: vi.fn(),
      })

      mockClient.chat.postMessage.mockClear()
      processMessage.mockResolvedValue({ text: 'Follow-up response' })

      await registeredEventHandlers['message']({
        event: {
          text: 'Follow up question',
          ts: 'dm-reply-ts',
          thread_ts: 'dm-thread-ts',
          channel: 'D123',
          channel_type: 'im',
        },
        client: mockClient,
      })

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: ':hourglass_flipping_sand: _Thinking..._',
        })
      )
    })

    it('sends error when no repos found in DM', async () => {
      listRepos.mockResolvedValue([])

      await registeredEventHandlers['message']({
        event: { text: 'Hello DM', ts: 'dm-ts', channel: 'D123', channel_type: 'im' },
        client: mockClient,
      })

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'D123',
          text: expect.stringContaining('No repositories found'),
        })
      )
    })

    it('sends error when listRepos throws in DM', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      listRepos.mockRejectedValue(new Error('db fail'))

      await registeredEventHandlers['message']({
        event: { text: 'Hello DM', ts: 'dm-ts', channel: 'D123', channel_type: 'im' },
        client: mockClient,
      })

      expect(consoleSpy).toHaveBeenCalledWith('[slack] Error showing repo selector in DM:', expect.any(Error))
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '⚠️ Failed to load repositories.',
        })
      )
      consoleSpy.mockRestore()
    })
  })

  describe('feedback handlers', () => {
    let mockClient

    beforeEach(async () => {
      mockClient = buildMockClient()
      await startSlackBot(buildMockConversationStore())
    })

    it('updates message with positive feedback when feedback is saved', async () => {
      const { processFeedback } = await import('../knowledge/feedback.js')
      processFeedback.mockResolvedValue({ saved: true })

      await registeredActionHandlers['feedback_positive']({
        action: { value: 'feedback-1' },
        body: { channel: { id: 'C123' }, message: { ts: 'msg-ts' } },
        client: mockClient,
        ack: vi.fn(),
      })

      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ts: 'msg-ts',
          text: expect.stringContaining('saved for future reference'),
        })
      )
    })

    it('logs error when processFeedback throws', async () => {
      const { processFeedback } = await import('../knowledge/feedback.js')
      processFeedback.mockRejectedValue(new Error('bad feedback store'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await registeredActionHandlers['feedback_negative']({
        action: { value: 'feedback-1' },
        body: { channel: { id: 'C123' }, message: { ts: 'msg-ts' } },
        client: mockClient,
        ack: vi.fn(),
      })

      expect(consoleSpy).toHaveBeenCalledWith('[slack] Feedback error:', expect.any(Error))
      consoleSpy.mockRestore()
    })
  })

  describe('/soporti slash command', () => {
    beforeEach(async () => {
      await startSlackBot(buildMockConversationStore())
    })

    it('registers the /soporti command', () => {
      expect(registeredCommandHandlers).toHaveProperty('/soporti')
    })

    it('shows help when invoked with no arguments', async () => {
      const respond = vi.fn().mockResolvedValue({})
      await registeredCommandHandlers['/soporti']({
        command: { text: '', user_id: 'U1', user_name: 'jane' },
        ack: vi.fn(),
        respond,
      })
      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Soporti commands') })
      )
    })

    it('shows message when user has no instructions saved', async () => {
      const respond = vi.fn().mockResolvedValue({})
      await registeredCommandHandlers['/soporti']({
        command: { text: 'instructions', user_id: 'U1', user_name: 'jane' },
        ack: vi.fn(),
        respond,
      })
      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('no personal instructions') })
      )
    })

    it('shows current instructions when present', async () => {
      const { getCustomInstructions } = await import('../db/users.js')
      getCustomInstructions.mockResolvedValueOnce('Speak like a pirate')

      const respond = vi.fn().mockResolvedValue({})
      await registeredCommandHandlers['/soporti']({
        command: { text: 'instructions', user_id: 'U1', user_name: 'jane' },
        ack: vi.fn(),
        respond,
      })
      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Speak like a pirate') })
      )
    })

    it('saves new instructions', async () => {
      const { updateCustomInstructions } = await import('../db/users.js')
      const respond = vi.fn().mockResolvedValue({})

      await registeredCommandHandlers['/soporti']({
        command: { text: 'instructions Talk to me like a senior engineer', user_id: 'U1', user_name: 'jane' },
        ack: vi.fn(),
        respond,
      })

      expect(updateCustomInstructions).toHaveBeenCalledWith(7, 'Talk to me like a senior engineer')
      expect(respond).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('saved') }))
    })

    it('clears instructions', async () => {
      const { updateCustomInstructions } = await import('../db/users.js')
      const respond = vi.fn().mockResolvedValue({})

      await registeredCommandHandlers['/soporti']({
        command: { text: 'instructions clear', user_id: 'U1', user_name: 'jane' },
        ack: vi.fn(),
        respond,
      })

      expect(updateCustomInstructions).toHaveBeenCalledWith(7, '')
      expect(respond).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('cleared') }))
    })

    it('shows help for unknown subcommand', async () => {
      const respond = vi.fn().mockResolvedValue({})
      await registeredCommandHandlers['/soporti']({
        command: { text: 'doSomething', user_id: 'U1', user_name: 'jane' },
        ack: vi.fn(),
        respond,
      })
      expect(respond).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Unknown subcommand') })
      )
    })
  })
})
