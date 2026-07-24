import { EventEmitter } from 'node:events'
import express from 'express'

EventEmitter.defaultMaxListeners = 20
import config from './config.js'
import { setupSecurity } from './middleware/security.js'
import { requireAuth } from './middleware/auth.js'
import { ConversationStore } from './sessions/conversation-store.js'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import reposRouter from './routes/repos.js'
import chatRoute from './routes/chat.js'
import conversationsRoute from './routes/conversations.js'
import mermaidRouter from './routes/mermaid.js'
import integrationsRouter from './routes/integrations.js'
import statsRouter from './routes/stats.js'
import shareRoute from './routes/share.js'
import feedbackRouter from './routes/feedback.js'
import userRouter from './routes/user.js'
import { ShareStore } from './shares/store.js'
import { startSlackBot, stopSlackBot } from './slack/bot.js'
import { setupReviewWebhook } from './review/index.js'
import { pool } from './repo-pool/index.js'
import { shutdown as shutdownPostgres, isConfigured as isPostgresConfigured } from './postgres/client.js'
import { runMigrations, shutdown as shutdownDb } from './db/index.js'
import { countAdmins } from './db/users.js'
import { announceSetupCode } from './auth/setup-code.js'
import { getGithubToken, getWebhookSecret } from './github/settings.js'
import { getOpenAIApiKey, getOpenAIModel } from './openai/settings.js'

const app = express()

setupReviewWebhook(app)

setupSecurity(app)

app.use(express.json({ limit: '2mb' }))

app.use(requireAuth)

const conversationStore = new ConversationStore()
const shareStore = new ShareStore()

app.use('/api/auth', authRouter)
app.use('/api/admin', adminRouter)
app.use('/api/repos', reposRouter)
app.use('/api/chat', chatRoute(conversationStore))
app.use('/api/conversations', conversationsRoute(conversationStore))
app.use('/api/mermaid', mermaidRouter)
app.use('/api/integrations', integrationsRouter)
app.use('/api/stats', statsRouter)
app.use('/api/share', shareRoute(shareStore))
app.use('/api/feedback', feedbackRouter)
app.use('/api/user', userRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(config.port, async () => {
  console.log(`Server running on http://localhost:${config.port}`)
  console.log('Using OpenAI Agents SDK')

  try {
    await runMigrations()
  } catch (err) {
    console.error('Failed to run database migrations:', err.message)
  }

  try {
    console.log(`PostgreSQL: ${(await isPostgresConfigured()) ? 'configured' : 'not configured'}`)
    if ((await countAdmins()) === 0) {
      console.log('[auth] No admin account exists yet. Open /admin in the web app to create one.')
      announceSetupCode()
    }
    if (!(await getOpenAIApiKey())) {
      console.log('[openai] No API key configured — set it in /admin (OpenAI section) to enable the assistant.')
    } else {
      const model = await getOpenAIModel()
      console.log(
        model ? `[openai] Model: ${model}` : '[openai] No model configured — set it in /admin (OpenAI section).'
      )
    }
    if (!(await getGithubToken())) {
      console.log('[github] No GitHub token configured — set it in /admin (GitHub section) to enable repo features.')
    }
    if (!(await getWebhookSecret())) {
      console.log('[review] PR reviews inactive — set the webhook secret in /admin (GitHub section) to enable them.')
    }
  } catch (err) {
    console.error('Failed to check for an admin account:', err.message)
  }

  try {
    await startSlackBot(conversationStore)
  } catch (err) {
    console.error('Failed to start Slack bot:', err.message)
  }
})

async function shutdown() {
  await stopSlackBot()
  await pool.shutdown()
  await shutdownPostgres()
  await shutdownDb()
  shareStore.destroy()
  conversationStore.destroy()
  process.exit(0)
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down...')
  shutdown()
})

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...')
  shutdown()
})
