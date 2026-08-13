import { listRepos } from '../github/client.js'
import { listConfiguredIntegrations, GITHUB_INTEGRATION_ID } from '../integrations/catalog.js'
import { INTEGRATION_PREFIX, YOLO_SOURCE } from '../agent/sources.js'

function toRepoSource(repo) {
  return { source: repo.fullName, description: repo.description, language: repo.language }
}

function toIntegrationSource(integration) {
  return {
    source: `${INTEGRATION_PREFIX}${integration.id}`,
    name: integration.name,
    description: integration.description,
  }
}

export async function executeListSources({ userId, scope }) {
  const [repos, integrations] = await Promise.all([listRepos(), listConfiguredIntegrations(userId)])

  const selectable = integrations.filter(integration => integration.id !== GITHUB_INTEGRATION_ID)
  const scopeList = Array.isArray(scope) ? scope : []

  if (scopeList.length === 0 || scopeList.includes(YOLO_SOURCE)) {
    return { repos: repos.map(toRepoSource), integrations: selectable.map(toIntegrationSource) }
  }

  return {
    repos: repos.filter(repo => scopeList.includes(repo.fullName)).map(toRepoSource),
    integrations: selectable
      .filter(integration => scopeList.includes(`${INTEGRATION_PREFIX}${integration.id}`))
      .map(toIntegrationSource),
  }
}
