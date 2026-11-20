import { PROFILE_OPTIONS, YOLO_SOURCE } from '../../constants.js'

const INTEGRATION_PREFIX = 'integration:'
const AUTO_LABEL = 'Auto'
const NO_SOURCE_LABEL = 'No source'
const SEPARATOR = ' · '

function sourceName(source, integrations) {
  if (!source.startsWith(INTEGRATION_PREFIX)) return source.split('/').pop()

  const id = source.slice(INTEGRATION_PREFIX.length)
  return integrations.find(integration => integration.id === id)?.name ?? id
}

function sourcesLabel(selectedSources, integrations) {
  if (selectedSources.includes(YOLO_SOURCE)) return AUTO_LABEL
  if (selectedSources.length === 0) return NO_SOURCE_LABEL
  if (selectedSources.length === 1) return sourceName(selectedSources[0], integrations)

  return `${selectedSources.length} sources`
}

export function summarizeSources({ selectedSources, integrations, profile }) {
  const profileLabel = PROFILE_OPTIONS.find(option => option.id === profile)?.label ?? PROFILE_OPTIONS[0].label

  return [sourcesLabel(selectedSources, integrations), profileLabel].join(SEPARATOR)
}
