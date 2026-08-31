export function claimedBy(subagents, editingId = null) {
  const owners = {}

  for (const subagent of subagents) {
    if (subagent.id === editingId || !subagent.exclusive || !subagent.enabled) continue

    for (const tool of subagent.tools) owners[tool] = subagent.name
  }

  return owners
}

export function claimedToolNames(subagents) {
  return new Set(Object.keys(claimedBy(subagents)))
}

export function selectableTools(group, owners) {
  return group.tools.filter(tool => !owners[tool])
}

export function isGroupSelected(group, owners, selected) {
  const selectable = selectableTools(group, owners)

  return selectable.length > 0 && selectable.every(tool => selected.includes(tool))
}

export function toggleGroupTools(selected, group, owners) {
  const selectable = selectableTools(group, owners)

  if (isGroupSelected(group, owners, selected)) return selected.filter(tool => !selectable.includes(tool))

  return [...selected, ...selectable.filter(tool => !selected.includes(tool))]
}
