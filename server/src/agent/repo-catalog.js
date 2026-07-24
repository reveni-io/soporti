import { getRepoCatalog } from '../github/settings.js'

export async function buildRepoCatalogPrompt() {
  const text = (await getRepoCatalog()).trim()
  if (!text) return ''

  return `## Repository catalog

Use this catalog to pick the most relevant repo(s) for the question before calling other tools. Each entry summarizes what the repo covers.

${text}`
}
