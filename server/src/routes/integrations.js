import { Router } from 'express'
import * as notion from '../notion/client.js'
import * as postgres from '../postgres/client.js'
import * as helpjuice from '../helpjuice/client.js'
import * as shopify from '../shopify/client.js'
import * as googleDrive from '../google-drive/client.js'
import * as shortcut from '../shortcut/client.js'
import * as sentry from '../sentry/client.js'
import * as betterstack from '../betterstack/client.js'
import { INTEGRATIONS } from '../agent/integrations.js'

const router = Router()

router.get('/', async (_req, res) => {
  const integrations = [
    {
      id: 'github',
      name: 'GitHub',
      description: 'Explore repositories, read files, and search code',
      selectable: false,
    },
  ]

  if (await notion.isConfigured()) {
    integrations.push({
      id: 'notion',
      name: INTEGRATIONS.notion.label,
      description: 'Search and read Notion pages',
      selectable: true,
    })
  }

  if (await postgres.isConfigured()) {
    integrations.push({
      id: 'postgres',
      name: INTEGRATIONS.postgres.label,
      description: 'Query and explore the PostgreSQL database',
      selectable: true,
    })
  }

  if (await helpjuice.isConfigured()) {
    integrations.push({
      id: 'helpjuice',
      name: INTEGRATIONS.helpjuice.label,
      description: 'Search and read help center articles',
      selectable: true,
    })
  }

  if (await shopify.isConfigured()) {
    integrations.push({
      id: 'shopify',
      name: INTEGRATIONS.shopify.label,
      description: 'Query Shopify orders, products, and webhooks (read-only)',
      selectable: true,
    })
  }

  if (await googleDrive.isConfigured()) {
    integrations.push({
      id: 'google-drive',
      name: INTEGRATIONS['google-drive'].label,
      description: 'Search, browse and read Google Drive documents',
      selectable: true,
    })
  }

  if (await shortcut.isConfigured()) {
    integrations.push({
      id: 'shortcut',
      name: INTEGRATIONS.shortcut.label,
      description: 'Look up stories, epics, and iterations',
      selectable: false,
    })
  }

  if (await sentry.isConfigured()) {
    integrations.push({
      id: 'sentry',
      name: INTEGRATIONS.sentry.label,
      description: 'Inspect production errors and issues',
      selectable: false,
    })
  }

  if (await betterstack.isConfigured()) {
    integrations.push({
      id: 'betterstack',
      name: INTEGRATIONS.betterstack.label,
      description: 'Search and query application logs',
      selectable: true,
    })
  }

  res.json({ integrations })
})

export default router
