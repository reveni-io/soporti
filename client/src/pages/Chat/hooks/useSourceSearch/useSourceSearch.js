import { useState } from 'react'

const YOLO_KEYWORDS = ['yolo', 'auto']

function matches(query, ...values) {
  return values.some(value => value?.toLowerCase().includes(query))
}

export function useSourceSearch({ repos, integrations }) {
  const [search, setSearch] = useState('')
  const query = search.toLowerCase()

  const filteredRepos = repos.filter(repo => {
    if (!search) return true
    return matches(query, repo.fullName, repo.description, repo.language)
  })

  const filteredIntegrations = integrations.filter(integration => {
    if (integration.selectable === false) return false
    if (!search) return true
    return matches(query, integration.name, integration.description)
  })

  const yoloMatches = !search || YOLO_KEYWORDS.some(keyword => keyword.includes(query))

  return { search, setSearch, filteredRepos, filteredIntegrations, yoloMatches }
}
