import * as notion from '../notion/client.js'
import * as postgres from '../postgres/client.js'
import * as helpjuice from '../helpjuice/client.js'
import * as shopify from '../shopify/client.js'
import * as googleDrive from '../google-drive/client.js'
import * as shortcut from '../shortcut/client.js'
import * as sentry from '../sentry/client.js'
import * as betterstack from '../betterstack/client.js'
import * as granola from '../granola/client.js'
import { ALWAYS_AVAILABLE_INTEGRATIONS, INTEGRATIONS } from '../agent/integrations.js'

export const GITHUB_INTEGRATION_ID = 'github'

function catalogEntry(id, description, isConfigured) {
  return {
    id,
    name: INTEGRATIONS[id].label,
    description,
    selectable: !ALWAYS_AVAILABLE_INTEGRATIONS.has(id),
    isConfigured,
  }
}

const CATALOG = [
  {
    id: GITHUB_INTEGRATION_ID,
    name: 'GitHub',
    description: 'Explore repositories, read files, and search code',
    selectable: false,
    isConfigured: async () => true,
  },
  catalogEntry('notion', 'Search and read Notion pages', notion.isConfigured),
  catalogEntry('postgres', 'Query and explore the PostgreSQL database', postgres.isConfigured),
  catalogEntry('helpjuice', 'Search and read help center articles', helpjuice.isConfigured),
  catalogEntry('shopify', 'Query Shopify orders, products, and webhooks (read-only)', shopify.isConfigured),
  catalogEntry('google-drive', 'Search, browse and read Google Drive documents', googleDrive.isConfigured),
  catalogEntry('shortcut', 'Look up stories, epics, and iterations', shortcut.isConfigured),
  catalogEntry('sentry', 'Inspect production errors and issues', sentry.isConfigured),
  catalogEntry('granola', 'Search and read your own meeting notes', granola.isConfigured),
  catalogEntry('betterstack', 'Search and query application logs', betterstack.isConfigured),
]

export async function listConfiguredIntegrations(userId) {
  const configured = await Promise.all(CATALOG.map(integration => integration.isConfigured(userId)))

  return CATALOG.filter((_, index) => configured[index]).map(({ id, name, description, selectable }) => ({
    id,
    name,
    description,
    selectable,
  }))
}
