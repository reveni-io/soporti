import { describe, it, expect, vi, beforeEach } from 'vitest'

const notionIsConfigured = vi.fn()
const postgresIsConfigured = vi.fn()
const helpjuiceIsConfigured = vi.fn()
const shopifyIsConfigured = vi.fn()
const googleDriveIsConfigured = vi.fn()
const shortcutIsConfigured = vi.fn()
const sentryIsConfigured = vi.fn()
const betterstackIsConfigured = vi.fn()
const granolaIsConfigured = vi.fn()
const figmaIsConfigured = vi.fn()
const zendeskIsConfigured = vi.fn()
const sendcloudIsConfigured = vi.fn()
const hubspotIsConfigured = vi.fn()

vi.mock('../notion/client.js', () => ({ isConfigured: (...args) => notionIsConfigured(...args) }))
vi.mock('../postgres/client.js', () => ({ isConfigured: (...args) => postgresIsConfigured(...args) }))
vi.mock('../helpjuice/client.js', () => ({ isConfigured: (...args) => helpjuiceIsConfigured(...args) }))
vi.mock('../shopify/client.js', () => ({ isConfigured: (...args) => shopifyIsConfigured(...args) }))
vi.mock('../google-drive/client.js', () => ({ isConfigured: (...args) => googleDriveIsConfigured(...args) }))
vi.mock('../shortcut/client.js', () => ({ isConfigured: (...args) => shortcutIsConfigured(...args) }))
vi.mock('../sentry/client.js', () => ({ isConfigured: (...args) => sentryIsConfigured(...args) }))
vi.mock('../betterstack/client.js', () => ({ isConfigured: (...args) => betterstackIsConfigured(...args) }))
vi.mock('../granola/client.js', () => ({ isConfigured: (...args) => granolaIsConfigured(...args) }))
vi.mock('../figma/client.js', () => ({ isConfigured: (...args) => figmaIsConfigured(...args) }))
vi.mock('../zendesk/client.js', () => ({ isConfigured: (...args) => zendeskIsConfigured(...args) }))
vi.mock('../sendcloud/client.js', () => ({ isConfigured: (...args) => sendcloudIsConfigured(...args) }))
vi.mock('../hubspot/client.js', () => ({ isConfigured: (...args) => hubspotIsConfigured(...args) }))

const { listConfiguredIntegrations, GITHUB_INTEGRATION_ID } = await import('./catalog.js')

function configureAll(value) {
  notionIsConfigured.mockResolvedValue(value)
  postgresIsConfigured.mockResolvedValue(value)
  helpjuiceIsConfigured.mockResolvedValue(value)
  shopifyIsConfigured.mockResolvedValue(value)
  googleDriveIsConfigured.mockResolvedValue(value)
  shortcutIsConfigured.mockResolvedValue(value)
  sentryIsConfigured.mockResolvedValue(value)
  betterstackIsConfigured.mockResolvedValue(value)
  granolaIsConfigured.mockResolvedValue(value)
  figmaIsConfigured.mockResolvedValue(value)
  zendeskIsConfigured.mockResolvedValue(value)
  sendcloudIsConfigured.mockResolvedValue(value)
  hubspotIsConfigured.mockResolvedValue(value)
}

beforeEach(() => vi.clearAllMocks())

describe('listConfiguredIntegrations', () => {
  it('lists every configured integration with its name and description', async () => {
    configureAll(true)

    const integrations = await listConfiguredIntegrations(7)

    expect(integrations.map(integration => integration.id)).toEqual([
      'github',
      'notion',
      'postgres',
      'helpjuice',
      'shopify',
      'google-drive',
      'shortcut',
      'sentry',
      'granola',
      'betterstack',
      'figma',
      'zendesk',
      'sendcloud',
      'hubspot',
    ])
    expect(integrations.find(integration => integration.id === 'betterstack')).toEqual({
      id: 'betterstack',
      name: 'Better Stack',
      description: 'Search and query application logs',
      selectable: true,
    })
  })

  it('marks always-on integrations as not selectable', async () => {
    configureAll(true)

    const selectableById = Object.fromEntries(
      (await listConfiguredIntegrations(7)).map(integration => [integration.id, integration.selectable])
    )

    expect(selectableById).toEqual({
      github: false,
      shortcut: false,
      sentry: false,
      notion: true,
      postgres: true,
      helpjuice: true,
      shopify: true,
      'google-drive': true,
      granola: true,
      betterstack: true,
      figma: true,
      zendesk: true,
      sendcloud: true,
      hubspot: true,
    })
  })

  it('always lists GitHub, even with nothing else configured', async () => {
    configureAll(false)

    const integrations = await listConfiguredIntegrations(7)

    expect(integrations.map(integration => integration.id)).toEqual([GITHUB_INTEGRATION_ID])
  })

  it('drops the integrations that are not configured', async () => {
    configureAll(false)
    notionIsConfigured.mockResolvedValue(true)
    sentryIsConfigured.mockResolvedValue(true)

    const integrations = await listConfiguredIntegrations(7)

    expect(integrations.map(integration => integration.id)).toEqual(['github', 'notion', 'sentry'])
  })

  it('checks Granola for the requesting user', async () => {
    configureAll(false)
    granolaIsConfigured.mockResolvedValue(true)

    const integrations = await listConfiguredIntegrations(7)

    expect(granolaIsConfigured).toHaveBeenCalledWith(7)
    expect(integrations.map(integration => integration.id)).toEqual(['github', 'granola'])
  })
  it('checks Zendesk for the requesting user', async () => {
    configureAll(false)
    zendeskIsConfigured.mockResolvedValue(true)

    const integrations = await listConfiguredIntegrations(7)

    expect(zendeskIsConfigured).toHaveBeenCalledWith(7)
    expect(integrations.map(integration => integration.id)).toEqual(['github', 'zendesk'])
  })

  it('lists Sendcloud once an account is linked', async () => {
    configureAll(false)
    sendcloudIsConfigured.mockResolvedValue(true)

    const integrations = await listConfiguredIntegrations(7)

    expect(integrations.find(integration => integration.id === 'sendcloud')).toEqual({
      id: 'sendcloud',
      name: 'Sendcloud',
      description: 'Track parcels, returns and shipping methods across the linked Sendcloud accounts (read-only)',
      selectable: true,
    })
  })

  it('lists HubSpot once a key is saved', async () => {
    configureAll(false)
    hubspotIsConfigured.mockResolvedValue(true)

    const integrations = await listConfiguredIntegrations(7)

    expect(hubspotIsConfigured).toHaveBeenCalledTimes(1)
    expect(integrations.map(integration => integration.id)).toEqual(['github', 'hubspot'])
    expect(integrations.find(integration => integration.id === 'hubspot')).toEqual({
      id: 'hubspot',
      name: 'HubSpot',
      description: 'Search and read HubSpot CRM records, and write what /admin allows',
      selectable: true,
    })
  })
})
