import { describe, it, expect } from 'vitest'
import { ANALYTICS_INSTRUCTIONS, buildChartPrompt } from './prompt.js'

const CHART = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}

function card(overrides = {}) {
  return {
    id: '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5',
    title: 'Returns per week over the last 3 months',
    prompt: 'Returns per week over the last 3 months',
    sql: null,
    chart: null,
    ...overrides,
  }
}

describe('ANALYTICS_INSTRUCTIONS', () => {
  it('names the tools of the agent and the order to use them in', () => {
    const tools = [
      'list_database_schemas',
      'list_database_tables',
      'describe_database_table',
      'query_database',
      'submit_chart',
    ]
    const positions = tools.map(name => ANALYTICS_INSTRUCTIONS.indexOf(name))

    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('states the row cap of the dashboard', () => {
    expect(ANALYTICS_INSTRUCTIONS).toContain('reads at most 2000 rows')
  })

  it('describes every chart type', () => {
    for (const type of ['line', 'area', 'bar', 'row', 'number', 'table', 'pie']) {
      expect(ANALYTICS_INSTRUCTIONS).toContain(`\`${type}\``)
    }
  })

  it('covers revisions and what to do when the database cannot answer', () => {
    expect(ANALYTICS_INSTRUCTIONS).toContain('## Revising a card')
    expect(ANALYTICS_INSTRUCTIONS).toContain('change only what was asked')
    expect(ANALYTICS_INSTRUCTIONS).toContain('## When the database cannot answer')
    expect(ANALYTICS_INSTRUCTIONS).toContain('shown on the card as its error')
  })
})

describe('buildChartPrompt', () => {
  it('asks for a new card with the question when the card has no query yet', () => {
    expect(buildChartPrompt(card())).toBe(
      'Build a dashboard card for this request.\n\n## Request\n\nReturns per week over the last 3 months'
    )
  })

  it('asks for a revision with the current title, query and chart and the requested change', () => {
    const sql = "SELECT date_trunc('week', created_at) AS week, count(*) AS returns FROM returns GROUP BY 1 ORDER BY 1"
    const prompt = buildChartPrompt(card({ title: 'Returns per week', prompt: 'Make it monthly', sql, chart: CHART }))

    expect(prompt).toMatch(/^Revise this dashboard card\./)
    expect(prompt).toContain('Title: Returns per week')
    expect(prompt).toContain(`\`\`\`sql\n${sql}\n\`\`\``)
    expect(prompt).toContain(`\`\`\`json\n${JSON.stringify(CHART, null, 2)}\n\`\`\``)
    expect(prompt).toMatch(/## Requested change\n\nMake it monthly$/)
    expect(prompt).not.toContain('Build a dashboard card')
  })
})
