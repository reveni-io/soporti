import { describe, it, expect } from 'vitest'
import { buildGraph, layoutPositions, mergeNodeData } from './flow-graph.js'

const TOOL_GROUPS = [
  { id: 'repo', label: 'Repositories', configured: true, tools: ['search_code', 'get_file_contents'] },
  { id: 'sentry', label: 'Sentry', configured: true, tools: ['get_sentry_issue'] },
  { id: 'notion', label: 'Notion', configured: false, tools: ['search_notion_pages'] },
]

function subagent(overrides) {
  return { id: 1, name: 'code', tools: ['search_code'], exclusive: true, enabled: true, ...overrides }
}

describe('buildGraph', () => {
  it('leaves unconfigured integrations out of the parent', () => {
    const { parent } = buildGraph([], TOOL_GROUPS)

    expect(parent.toolCount).toBe(3)
    expect(parent.groups.map(entry => entry.group.id)).toEqual(['repo', 'sentry'])
  })

  it('moves an exclusive subagent tools off the parent', () => {
    const { parent, children } = buildGraph([subagent({})], TOOL_GROUPS)

    expect(parent.toolCount).toBe(2)
    expect(parent.delegated).toBe(1)
    expect(children[0].groups[0].tools).toEqual(['search_code'])
  })

  it('narrows the parent to the main agent allowlist', () => {
    const { parent } = buildGraph([], TOOL_GROUPS, ['search_code'])

    expect(parent.toolCount).toBe(1)
    expect(parent.groups.map(entry => entry.group.id)).toEqual(['repo'])
    expect(parent.groups[0].tools).toEqual(['search_code'])
    expect(parent.delegated).toBe(0)
  })

  it('keeps every configured tool when there is no allowlist', () => {
    const { parent } = buildGraph([], TOOL_GROUPS, null)

    expect(parent.toolCount).toBe(3)
  })

  it('leaves the parent with nothing on an empty allowlist', () => {
    const { parent } = buildGraph([], TOOL_GROUPS, [])

    expect(parent.toolCount).toBe(0)
    expect(parent.groups).toEqual([])
  })

  it('only counts as delegated what the parent would otherwise have held', () => {
    const { parent } = buildGraph([subagent({})], TOOL_GROUPS, ['get_sentry_issue'])

    expect(parent.toolCount).toBe(1)
    expect(parent.delegated).toBe(0)
  })

  it('counts a claimed tool as delegated when the allowlist included it', () => {
    const { parent } = buildGraph([subagent({})], TOOL_GROUPS, ['search_code', 'get_sentry_issue'])

    expect(parent.toolCount).toBe(1)
    expect(parent.delegated).toBe(1)
  })

  it('gives a subagent no group for an unconfigured integration', () => {
    const { children } = buildGraph([subagent({ tools: ['search_notion_pages'] })], TOOL_GROUPS)

    expect(children[0].groups).toEqual([])
  })
})

describe('layoutPositions', () => {
  it('puts the parent alone at the origin', () => {
    const { parent, children } = layoutPositions({ width: 400, height: 160 }, [])

    expect(parent).toEqual({ x: 0, y: 0 })
    expect(children).toEqual([])
  })

  it('centres one child under a wider parent', () => {
    const { parent, children } = layoutPositions({ width: 400, height: 160 }, [{ width: 300, height: 200 }])

    expect(parent.x).toBe(0)
    expect(children[0].x).toBe(50)
    expect(children[0].y).toBe(248)
  })

  it('centres the parent over a wider row of children', () => {
    const sizes = [
      { width: 300, height: 200 },
      { width: 300, height: 200 },
    ]
    const { parent, children } = layoutPositions({ width: 400, height: 160 }, sizes)

    expect(children[0].x).toBe(0)
    expect(children[1].x).toBe(348)
    expect(parent.x).toBe(124)
  })

  it('keeps every child on the same row', () => {
    const sizes = [300, 300, 300, 300].map(width => ({ width, height: 200 }))
    const { children } = layoutPositions({ width: 400, height: 160 }, sizes)

    expect(new Set(children.map(child => child.y)).size).toBe(1)
  })
})

describe('mergeNodeData', () => {
  it('keeps the position it already has and takes the fresh data', () => {
    const positioned = [{ id: 'parent', position: { x: 10, y: 20 }, data: { toolCount: 3 } }]
    const fresh = [{ id: 'parent', position: { x: 0, y: 0 }, data: { toolCount: 7 } }]

    expect(mergeNodeData(positioned, fresh)).toEqual([
      { id: 'parent', position: { x: 10, y: 20 }, data: { toolCount: 7 } },
    ])
  })

  it('takes a node that has no position yet as it comes', () => {
    const fresh = [{ id: '2', position: { x: 0, y: 0 }, data: {} }]

    expect(mergeNodeData([], fresh)).toEqual(fresh)
  })

  it('drops a node that is no longer in the fresh set', () => {
    const positioned = [{ id: '2', position: { x: 5, y: 5 }, data: {} }]

    expect(mergeNodeData(positioned, [])).toEqual([])
  })
})
