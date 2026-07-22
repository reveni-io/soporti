import { getRepoCatalog } from '../github/settings.js'

// The repository catalog is free text edited in the admin panel (GitHub
// section) and stored in app_config. It tells the agent what each repo covers
// so it can pick the relevant one(s) before calling tools. Empty = no section.
export async function buildRepoCatalogPrompt() {
  const text = (await getRepoCatalog()).trim()
  if (!text) return ''

  return `## Repository catalog

Use this catalog to pick the most relevant repo(s) for the question before calling other tools. Each entry summarizes what the repo covers.

${text}`
}
