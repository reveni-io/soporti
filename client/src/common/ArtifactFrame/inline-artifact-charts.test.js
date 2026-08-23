import { describe, it, expect, vi } from 'vitest'
import { act } from '@testing-library/react'
import { chartStageWidth, inlineArtifactCharts } from './inline-artifact-charts.js'

vi.mock('recharts', async () => {
  const reactModule = await import('react')
  const { createElement } = reactModule
  const stub = testId =>
    function Stub({ children }) {
      return createElement('div', { 'data-testid': testId }, children)
    }

  return {
    ResponsiveContainer: stub('responsive-container'),
    BarChart: function BarChart({ children, width }) {
      return createElement(
        'svg',
        { 'data-testid': 'bar-chart', 'data-width': String(width), width: 500, height: 300 },
        children
      )
    },
    LineChart: stub('line-chart'),
    AreaChart: stub('area-chart'),
    PieChart: stub('pie-chart'),
    Bar: function Bar(props) {
      const { createElement } = reactModule
      return createElement('div', { 'data-testid': 'bar', 'data-animation': String(props.isAnimationActive) })
    },
    Line: stub('line'),
    Area: stub('area'),
    Pie: stub('pie'),
    Cell: stub('cell'),
    XAxis: stub('x-axis'),
    YAxis: stub('y-axis'),
    CartesianGrid: stub('grid'),
    Tooltip: stub('tooltip'),
    Legend: stub('legend'),
  }
})

const BAR_SPEC = JSON.stringify({ type: 'bar', title: 'Sales', data: [{ name: 'Jan', value: 100 }] })

async function inlined(html) {
  let result
  await act(async () => {
    result = await inlineArtifactCharts(html)
  })
  return result
}

describe('inlineArtifactCharts', () => {
  it('returns the html untouched when there is no chart placeholder', async () => {
    const html = '<h1>Report</h1><p>All good.</p>'

    await expect(inlineArtifactCharts(html)).resolves.toBe(html)
  })

  it('renders a placeholder with the app chart component', async () => {
    const result = await inlined(`<h1>Report</h1><div data-chart='${BAR_SPEC}'></div>`)

    expect(result).toContain('<h1>Report</h1>')
    expect(result).toContain('chart-block')
    expect(result).toContain('Sales')
    expect(result).toContain('bar-chart')
  })

  it('snapshots the chart with the entrance animation off, so the data is drawn', async () => {
    const result = await inlined(`<div data-chart='${BAR_SPEC}'></div>`)

    expect(result).toContain('data-animation="false"')
  })

  it('renders every placeholder in the document', async () => {
    const result = await inlined(`<div data-chart='${BAR_SPEC}'></div><div data-chart='${BAR_SPEC}'></div>`)

    expect(result.match(/data-testid="bar-chart"/g)).toHaveLength(2)
  })

  it('keeps a style tag the parser moves into the head', async () => {
    const result = await inlined(
      `<style>h1 { color: var(--text-primary); }</style><div data-chart='${BAR_SPEC}'></div>`
    )

    expect(result).toContain('h1 { color: var(--text-primary); }')
    expect(result).toContain('chart-block')
  })

  it('shows the raw spec instead of a chart when the json is broken', async () => {
    const result = await inlined("<div data-chart='{broken'></div>")

    expect(result).toContain('chart-block--error')
    expect(result).toContain('{broken')
  })

  it('renders the chart at the default stage width without a measured container', async () => {
    const result = await inlined(`<div data-chart='${BAR_SPEC}'></div>`)

    expect(result).toContain('data-width="720"')
  })

  it('renders the chart at the width derived from the container', async () => {
    let result
    await act(async () => {
      result = await inlineArtifactCharts(`<div data-chart='${BAR_SPEC}'></div>`, 480)
    })

    expect(result).toContain('data-width="400"')
  })

  it('makes the snapshot scalable with a viewBox, so it shrinks with the panel', async () => {
    const result = await inlined(`<div data-chart='${BAR_SPEC}'></div>`)

    expect(result).toContain('viewBox="0 0 500 300"')
  })

  it('cleans up the offscreen stage it rendered into', async () => {
    const before = document.body.children.length

    await inlined(`<div data-chart='${BAR_SPEC}'></div>`)

    expect(document.body.children.length).toBe(before)
  })
})

describe('chartStageWidth', () => {
  it('falls back to the default width without a measured container', () => {
    expect(chartStageWidth(0)).toBe(720)
    expect(chartStageWidth(null)).toBe(720)
  })

  it('renders narrower than the container, leaving room for the sheet and figure padding', () => {
    expect(chartStageWidth(480)).toBe(400)
  })

  it('never goes below the readable minimum', () => {
    expect(chartStageWidth(200)).toBe(320)
  })

  it('caps at the sheet reading width on a wide page', () => {
    expect(chartStageWidth(1600)).toBe(780)
  })
})
