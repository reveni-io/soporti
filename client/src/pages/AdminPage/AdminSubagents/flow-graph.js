import { claimedToolNames } from './claimed-tools.js'

const COLUMN_GAP = 48
const ROW_GAP = 88

function heldGroups(toolGroups, toolNames) {
  const held = new Set(toolNames)

  return toolGroups
    .map(group => ({ group, tools: group.tools.filter(tool => held.has(tool)) }))
    .filter(entry => entry.tools.length > 0)
}

export function buildGraph(subagents, toolGroups, mainAgentTools = null) {
  const available = toolGroups.filter(group => group.configured)
  const claimed = claimedToolNames(subagents)
  const allowed = mainAgentTools ? new Set(mainAgentTools) : null
  const candidates = available.flatMap(group => group.tools).filter(tool => !allowed || allowed.has(tool))
  const parentTools = candidates.filter(tool => !claimed.has(tool))

  return {
    parent: {
      groups: heldGroups(available, parentTools),
      toolCount: parentTools.length,
      delegated: candidates.length - parentTools.length,
    },
    children: subagents.map(subagent => ({ subagent, groups: heldGroups(available, subagent.tools) })),
  }
}

export function layoutPositions(parentSize, childSizes) {
  const rowWidth =
    childSizes.reduce((total, size) => total + size.width, 0) + COLUMN_GAP * Math.max(0, childSizes.length - 1)
  const childOffset = Math.max(0, (parentSize.width - rowWidth) / 2)
  const childY = parentSize.height + ROW_GAP

  let x = childOffset
  const children = childSizes.map(size => {
    const position = { x, y: childY }
    x += size.width + COLUMN_GAP

    return position
  })

  return { parent: { x: Math.max(0, (rowWidth - parentSize.width) / 2), y: 0 }, children }
}

export function mergeNodeData(positioned, fresh) {
  const byId = new Map(positioned.map(node => [node.id, node]))

  return fresh.map(node => {
    const existing = byId.get(node.id)

    return existing ? { ...existing, data: node.data } : node
  })
}
