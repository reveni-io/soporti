export const INTEGRATIONS = {
  shortcut: { label: 'Shortcut', flag: 'shortcutConfigured' },
  notion: { label: 'Notion', flag: 'notionConfigured' },
  'google-drive': { label: 'Google Drive', flag: 'driveConfigured' },
  postgres: { label: 'Database', flag: 'postgresConfigured' },
  sentry: { label: 'Sentry', flag: 'sentryConfigured' },
  betterstack: { label: 'Better Stack', flag: 'betterstackConfigured' },
  aws: { label: 'AWS', flag: 'awsConfigured' },
  helpjuice: { label: 'Helpjuice', flag: 'helpjuiceConfigured' },
  shopify: { label: 'Shopify', flag: 'shopifyConfigured' },
  granola: { label: 'Granola', flag: 'granolaConfigured' },
  gmail: { label: 'Gmail', flag: 'gmailConfigured' },
  'google-calendar': { label: 'Google Calendar', flag: 'calendarConfigured' },
  figma: { label: 'Figma', flag: 'figmaConfigured' },
  zendesk: { label: 'Zendesk', flag: 'zendeskConfigured' },
  sendcloud: { label: 'Sendcloud', flag: 'sendcloudConfigured' },
  hubspot: { label: 'HubSpot', flag: 'hubspotConfigured' },
  slack: { label: 'Slack', flag: 'slackConfigured' },
}

export const ALWAYS_AVAILABLE_INTEGRATIONS = new Set(['shortcut', 'sentry'])

export function resolveAvailableIntegrations(policy, configured) {
  const flags = configured || {}
  const ids = Object.keys(INTEGRATIONS)
  const isConfigured = id => Boolean(flags[INTEGRATIONS[id].flag])

  if (!policy || policy.unrestricted) return ids.filter(isConfigured)

  const selected = policy.integrations.filter(id => INTEGRATIONS[id] && !ALWAYS_AVAILABLE_INTEGRATIONS.has(id))
  const alwaysAvailable = ids.filter(id => ALWAYS_AVAILABLE_INTEGRATIONS.has(id))

  return [...new Set([...selected, ...alwaysAvailable])].filter(isConfigured)
}

export function integrationLabels(ids) {
  return ids.map(id => INTEGRATIONS[id].label)
}
