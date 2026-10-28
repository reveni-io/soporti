export function applyToolDescriptions(tools, descriptions) {
  if (!descriptions) return tools

  return tools.map(candidate => {
    const description = descriptions[candidate.name]
    return description ? { ...candidate, description } : candidate
  })
}
