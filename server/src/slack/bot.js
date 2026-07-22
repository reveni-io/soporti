import pkg from '@slack/bolt'
const { App, LogLevel } = pkg

import { listRepos } from '../github/client.js'
import * as notion from '../notion/client.js'
import * as postgres from '../postgres/client.js'
import * as helpjuice from '../helpjuice/client.js'
import * as shopify from '../shopify/client.js'
import * as googleDrive from '../google-drive/client.js'
import { YOLO_SOURCE } from '../agent/sources.js'
import { processMessage } from './handler.js'
import { getSlackSettings } from './settings.js'
import { startAutoDiagnose, stopAutoDiagnose } from './auto-diagnose-poller.js'
import { markdownToSlack, splitMessage } from './formatter.js'
import { DEFAULT_PROFILE } from '../agent/system-prompt.js'
import { storePendingFeedback, processFeedback } from '../knowledge/feedback.js'
import { isKnowledgeBaseConfigured } from '../knowledge/client.js'
import { upsertSlackUser, getCustomInstructions, updateCustomInstructions } from '../db/users.js'

const MAX_INSTRUCTIONS_LENGTH = 50_000

const SOPORTI_HELP =
  '*Soporti commands*\n' +
  '• `/soporti instructions` — show your saved personal instructions\n' +
  '• `/soporti instructions <text>` — replace your personal instructions\n' +
  '• `/soporti instructions clear` — remove your personal instructions\n\n' +
  'Personal instructions are added to every conversation you have with me — use them to tell me about your role, ' +
  'preferred response style, or anything else I should keep in mind.'

async function handleInstructionsCommand({ slackUserId, slackUserName, argText }) {
  const user = await upsertSlackUser({ slackId: slackUserId, name: slackUserName ?? null })
  const trimmed = (argText ?? '').trim()

  if (!trimmed) {
    const current = await getCustomInstructions(user.id)
    if (!current) {
      return 'You have no personal instructions saved. Set them with `/soporti instructions <text>`.'
    }
    return `*Your personal instructions:*\n\`\`\`\n${current}\n\`\`\``
  }

  if (trimmed.toLowerCase() === 'clear' || trimmed.toLowerCase() === 'reset') {
    await updateCustomInstructions(user.id, '')
    return ':white_check_mark: Personal instructions cleared.'
  }

  if (trimmed.length > MAX_INSTRUCTIONS_LENGTH) {
    return `:warning: Instructions are too long (max ${MAX_INSTRUCTIONS_LENGTH.toLocaleString()} characters).`
  }

  await updateCustomInstructions(user.id, trimmed)
  return `:white_check_mark: Personal instructions saved (${trimmed.length} chars).`
}

let slackApp = null
let conversationStore = null

const pendingQuestions = new Map()

const threadSources = new Map()

const threadProfiles = new Map()

setInterval(
  () => {
    const cutoff = Date.now() - 10 * 60 * 1000
    for (const [key, entry] of pendingQuestions) {
      if (entry.createdAt < cutoff) pendingQuestions.delete(key)
    }
  },
  10 * 60 * 1000
).unref()

// Re-exported from settings.js: the credentials live in the database now, so
// this is async. Kept exported here because callers import it from the bot.
export { isSlackConfigured } from './settings.js'

async function buildSourceSelectorBlocks(question, repos) {
  const sourceOptions = [
    {
      text: { type: 'plain_text', text: '⚡ YOLO (auto)' },
      description: { type: 'plain_text', text: 'Let the agent decide which sources to use' },
      value: YOLO_SOURCE,
    },
  ]

  if (await notion.isConfigured()) {
    sourceOptions.push({
      text: { type: 'plain_text', text: 'Notion' },
      description: { type: 'plain_text', text: 'Search and read Notion pages' },
      value: 'integration:notion',
    })
  }

  if (await postgres.isConfigured()) {
    sourceOptions.push({
      text: { type: 'plain_text', text: 'Database' },
      description: { type: 'plain_text', text: 'Query and explore the PostgreSQL database' },
      value: 'integration:postgres',
    })
  }

  if (await helpjuice.isConfigured()) {
    sourceOptions.push({
      text: { type: 'plain_text', text: 'Helpjuice' },
      description: { type: 'plain_text', text: 'Search and read help center articles' },
      value: 'integration:helpjuice',
    })
  }

  if (await shopify.isConfigured()) {
    sourceOptions.push({
      text: { type: 'plain_text', text: 'Shopify' },
      description: { type: 'plain_text', text: 'Query Shopify orders, products, and webhooks (read-only)' },
      value: 'integration:shopify',
    })
  }

  if (await googleDrive.isConfigured()) {
    sourceOptions.push({
      text: { type: 'plain_text', text: 'Google Drive' },
      description: { type: 'plain_text', text: 'Search, browse and read Google Drive documents' },
      value: 'integration:google-drive',
    })
  }

  for (const r of repos.slice(0, 99)) {
    sourceOptions.push({
      text: { type: 'plain_text', text: r.fullName.slice(0, 75) },
      value: r.fullName,
    })
  }

  const profileOptions = [
    {
      text: { type: 'plain_text', text: 'Support' },
      description: { type: 'plain_text', text: 'Simple, non-technical answers' },
      value: 'support',
    },
    {
      text: { type: 'plain_text', text: 'Tech' },
      description: { type: 'plain_text', text: 'Detailed code and architecture' },
      value: 'tech',
    },
  ]

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `> ${question}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Sources:*',
      },
      accessory: {
        type: 'multi_static_select',
        placeholder: { type: 'plain_text', text: 'Choose sources...' },
        options: sourceOptions,
        action_id: 'select_sources',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Profile:*',
      },
      accessory: {
        type: 'static_select',
        placeholder: { type: 'plain_text', text: 'Choose a profile...' },
        options: profileOptions,
        initial_option: profileOptions[0],
        action_id: 'select_profile',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Go' },
          style: 'primary',
          action_id: 'confirm_selection',
        },
      ],
    },
  ]
}

async function fetchThreadContext({ client, channelId, threadTs, eventTs }) {
  if (!eventTs || threadTs === eventTs) return null

  try {
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 50,
      inclusive: true,
    })

    const messages = (result.messages || [])
      .filter(m => m.ts !== eventTs)
      .map(m => m.text)
      .filter(Boolean)

    if (messages.length === 0) return null
    return messages.join('\n---\n')
  } catch (err) {
    console.error('[slack] Failed to fetch thread context:', err.message)
  }
  return null
}

async function runAndReply({ client, channelId, threadTs, question, sources, profile, slackUserId }) {
  const thinking = await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: ':hourglass_flipping_sand: _Thinking..._',
  })

  try {
    const user = slackUserId ? await upsertSlackUser({ slackId: slackUserId, name: null }) : null
    const { conversationId, session, previousResponseId } = await conversationStore.resolveSlack(
      channelId,
      threadTs,
      user?.id ?? null
    )
    const result = await processMessage({
      message: question,
      selectedSources: sources,
      session,
      previousResponseId,
      profile,
      slackUserId,
    })

    await conversationStore.saveTurn(conversationId, { lastResponseId: result.lastResponseId })

    const slackText = markdownToSlack(result.text)
    const chunks = splitMessage(slackText)
    const SLACK_MAX_TEXT = 4000

    if (chunks.some(c => c.length > SLACK_MAX_TEXT)) {
      await client.chat.update({
        channel: channelId,
        ts: thinking.ts,
        text: '_Response was too long for a message. Uploading as file..._',
      })
      await client.filesUploadV2({
        channel_id: channelId,
        thread_ts: threadTs,
        content: result.text,
        filename: 'response.md',
        title: 'Agent Response',
      })
    } else {
      await client.chat.update({
        channel: channelId,
        ts: thinking.ts,
        text: chunks[0],
      })

      for (let i = 1; i < chunks.length; i++) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: chunks[i],
        })
      }
    }

    // Only offer the \ud83d\udc4d/\ud83d\udc4e feedback when the knowledge base is configured \u2014 a
    // saved case needs a vector store to land in.
    if (await isKnowledgeBaseConfigured()) {
      const feedbackId = storePendingFeedback(question, result.text)

      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        blocks: [
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '\ud83d\udc4d' },
                action_id: 'feedback_positive',
                value: feedbackId,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: '\ud83d\udc4e' },
                action_id: 'feedback_negative',
                value: feedbackId,
              },
            ],
          },
        ],
        text: 'Was this helpful?',
      })
    }
  } catch (err) {
    console.error('[slack] Agent error:', err)
    await client.chat.update({
      channel: channelId,
      ts: thinking.ts,
      text: '⚠️ An error occurred while processing your request.',
    })
  }
}

export async function startSlackBot(store) {
  // Keep the store reference even when Slack is not configured yet, so a later
  // save in the admin panel can reconnect (restartSlackBot reuses it).
  if (store) conversationStore = store

  // Already connected: do not open a second Socket Mode connection.
  if (slackApp) return slackApp

  // Credentials live in the database (admin panel → Slack section), resolved
  // here instead of read once from env vars.
  const { botToken, appToken, signingSecret } = await getSlackSettings()
  if (!botToken || !appToken) return null

  slackApp = new App({
    token: botToken,
    appToken,
    signingSecret,
    socketMode: true,
    logLevel: LogLevel.WARN,
  })

  slackApp.event('app_mention', async ({ event, client }) => {
    const displayQuestion = event.text.replace(/<@[A-Z0-9]+>/g, '').trim()
    const threadTs = event.thread_ts || event.ts
    const channelId = event.channel
    const slackUserId = event.user

    const threadContext = await fetchThreadContext({ client, channelId, threadTs, eventTs: event.ts })
    const question = threadContext
      ? `[Thread context — previous messages in this thread:\n${threadContext}]\n\n${displayQuestion}`
      : displayQuestion

    if (!displayQuestion) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: "Hi! Mention me with a question and I'll help you explore the codebase.",
      })
      return
    }

    const threadKey = `${channelId}-${threadTs}`
    const existingSources = threadSources.get(threadKey)

    if (existingSources) {
      const existingProfile = threadProfiles.get(threadKey) || DEFAULT_PROFILE
      await runAndReply({
        client,
        channelId,
        threadTs,
        question,
        sources: existingSources,
        profile: existingProfile,
        slackUserId,
      })
      return
    }

    try {
      const repos = await listRepos()

      if (repos.length === 0) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: 'No repositories found. Check the GitHub token configuration.',
        })
        return
      }

      const result = await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        blocks: await buildSourceSelectorBlocks(displayQuestion, repos),
        text: 'Select sources and profile to continue.',
      })

      pendingQuestions.set(result.ts, {
        question,
        displayQuestion,
        channelId,
        threadTs,
        selectedProfile: DEFAULT_PROFILE,
        slackUserId,
        createdAt: Date.now(),
      })
    } catch (err) {
      console.error('[slack] Error showing repo selector:', err)
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: '⚠️ Failed to load repositories.',
      })
    }
  })

  slackApp.action('select_profile', async ({ action, body, ack }) => {
    await ack()
    const pending = pendingQuestions.get(body.message.ts)
    if (pending) pending.selectedProfile = action.selected_option.value
  })

  slackApp.action('select_sources', async ({ action, body, ack }) => {
    await ack()
    const pending = pendingQuestions.get(body.message.ts)
    if (pending) pending.selectedSources = (action.selected_options || []).map(o => o.value)
  })

  async function handleFeedback({ action, body, client, ack }, useful) {
    await ack()
    try {
      const result = await processFeedback(action.value, useful)
      const text =
        useful && result.saved
          ? '\u2705 Thanks! This case has been saved for future reference.'
          : useful
            ? '\u2705 Thanks for the feedback!'
            : "Noted. We'll work on improving!"
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
        text,
      })
    } catch (err) {
      console.error('[slack] Feedback error:', err)
    }
  }

  slackApp.action('feedback_positive', async args => handleFeedback(args, true))
  slackApp.action('feedback_negative', async args => handleFeedback(args, false))

  slackApp.command('/soporti', async ({ command, ack, respond }) => {
    await ack()
    const fullText = (command.text || '').trim()
    const [subcommand, ...rest] = fullText.split(/\s+/)
    const argText = rest.join(' ')

    if (!subcommand || subcommand === 'help') {
      await respond({ response_type: 'ephemeral', text: SOPORTI_HELP })
      return
    }

    if (subcommand === 'instructions') {
      try {
        const text = await handleInstructionsCommand({
          slackUserId: command.user_id,
          slackUserName: command.user_name,
          argText,
        })
        await respond({ response_type: 'ephemeral', text })
      } catch (err) {
        console.error('[slack] /soporti instructions failed:', err)
        await respond({ response_type: 'ephemeral', text: ':warning: Something went wrong saving your instructions.' })
      }
      return
    }

    await respond({
      response_type: 'ephemeral',
      text: `Unknown subcommand \`${subcommand}\`.\n\n${SOPORTI_HELP}`,
    })
  })

  slackApp.action('confirm_selection', async ({ body, client, ack }) => {
    await ack()

    const messageTs = body.message.ts
    const channelId = body.channel.id
    const pending = pendingQuestions.get(messageTs)

    if (!pending) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: '⚠️ This selection has expired. Please ask your question again.',
      })
      return
    }

    const rawSelectedSources = pending.selectedSources
    if (!rawSelectedSources || rawSelectedSources.length === 0) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: body.user.id,
        text: 'Please select at least one source.',
      })
      return
    }

    const selectedSources = rawSelectedSources.includes(YOLO_SOURCE) ? [YOLO_SOURCE] : rawSelectedSources

    pendingQuestions.delete(messageTs)
    const { question, displayQuestion, threadTs, selectedProfile, slackUserId } = pending
    const profile = selectedProfile || DEFAULT_PROFILE
    const profileLabel = profile === 'tech' ? 'Tech' : 'Support'
    const sourceLabels = selectedSources
      .map(s => {
        if (s === YOLO_SOURCE) return '⚡ YOLO'
        if (s.startsWith('integration:')) return s.replace('integration:', '')
        return `\`${s}\``
      })
      .join(', ')

    const threadKey = `${channelId}-${threadTs}`
    threadSources.set(threadKey, selectedSources)
    threadProfiles.set(threadKey, profile)

    await client.chat.update({
      channel: channelId,
      ts: messageTs,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `> ${displayQuestion || question}\n\n*Sources:* ${sourceLabels} · *Profile:* ${profileLabel}`,
          },
        },
      ],
      text: `Sources: ${selectedSources.join(', ')} · Profile: ${profileLabel}`,
    })

    await runAndReply({
      client,
      channelId,
      threadTs,
      question,
      sources: selectedSources,
      profile,
      slackUserId: slackUserId || body.user.id,
    })
  })

  slackApp.event('message', async ({ event, client }) => {
    if (event.channel_type !== 'im') return
    if (event.bot_id || event.subtype) return

    const question = event.text?.trim()
    const threadTs = event.thread_ts || event.ts
    const channelId = event.channel
    const slackUserId = event.user

    if (!question) return

    const threadKey = `${channelId}-${threadTs}`
    const existingSources = threadSources.get(threadKey)

    if (existingSources) {
      const existingProfile = threadProfiles.get(threadKey) || DEFAULT_PROFILE
      await runAndReply({
        client,
        channelId,
        threadTs,
        question,
        sources: existingSources,
        profile: existingProfile,
        slackUserId,
      })
      return
    }

    try {
      const repos = await listRepos()

      if (repos.length === 0) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: 'No repositories found. Check the GitHub token configuration.',
        })
        return
      }

      const result = await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        blocks: await buildSourceSelectorBlocks(question, repos),
        text: 'Select sources and profile to continue.',
      })

      pendingQuestions.set(result.ts, {
        question,
        channelId,
        threadTs,
        selectedProfile: DEFAULT_PROFILE,
        slackUserId,
        createdAt: Date.now(),
      })
    } catch (err) {
      console.error('[slack] Error showing repo selector in DM:', err)
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: '⚠️ Failed to load repositories.',
      })
    }
  })

  await slackApp.start()
  console.log('Slack bot connected via Socket Mode')

  // Ticket auto-diagnose poller (issue #56). No-op unless configured; uses the
  // bot-token WebClient to read/write the tickets List.
  startAutoDiagnose({ client: slackApp.client })

  return slackApp
}

export async function stopSlackBot() {
  stopAutoDiagnose()
  if (slackApp) {
    await slackApp.stop()
    slackApp = null
  }
}

// Reconnect the bot with the current database credentials (called after the
// admin panel saves a token). Reuses the conversationStore captured at boot, so
// the bot picks up new tokens — or disconnects when they are cleared — without
// restarting the server. A no-op-to-connect transition happens once both the
// bot and app tokens are present.
export async function restartSlackBot() {
  await stopSlackBot()
  return startSlackBot()
}
