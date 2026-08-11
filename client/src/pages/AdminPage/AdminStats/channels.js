const CHANNEL_LABELS = {
  web: 'Web chat',
  slack: 'Slack',
  schedule: 'Schedules',
  pr_review: 'PR reviews',
  pr_mention: 'PR mentions',
  auto_diagnose: 'Ticket auto-diagnose',
  mcp: 'MCP',
}

const SOURCE_LABELS = {
  web: 'Web',
  slack: 'Slack',
}

export function channelLabel(channel) {
  return CHANNEL_LABELS[channel] ?? channel
}

export function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? source
}
