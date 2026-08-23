import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import ChartBlock from '../ChartBlock/ChartBlock.jsx'

const DEFAULT_STAGE_WIDTH_PX = 720
const MIN_STAGE_WIDTH_PX = 320
const MAX_STAGE_WIDTH_PX = 780
const STAGE_INSET_PX = 80
const MAX_SETTLE_FRAMES = 30
const REQUIRED_STABLE_FRAMES = 3

export function chartStageWidth(containerWidth) {
  if (!containerWidth || containerWidth <= 0) return DEFAULT_STAGE_WIDTH_PX

  return Math.min(Math.max(containerWidth - STAGE_INSET_PX, MIN_STAGE_WIDTH_PX), MAX_STAGE_WIDTH_PX)
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

function createStage(width) {
  const stage = document.createElement('div')
  stage.style.position = 'fixed'
  stage.style.left = '-10000px'
  stage.style.top = '0'
  stage.style.width = `${width}px`
  stage.style.pointerEvents = 'none'
  document.body.appendChild(stage)
  return stage
}

async function waitUntilSettled(stage) {
  let lastMarkup = null
  let stableFrames = 0

  for (let frame = 0; frame < MAX_SETTLE_FRAMES && stableFrames < REQUIRED_STABLE_FRAMES; frame++) {
    await nextFrame()
    const markup = stage.innerHTML
    stableFrames = markup !== '' && markup === lastMarkup ? stableFrames + 1 : 0
    lastMarkup = markup
  }
}

function ensureScalableSvg(stage) {
  for (const svg of stage.querySelectorAll('svg')) {
    const width = svg.getAttribute('width')
    const height = svg.getAttribute('height')
    if (!svg.getAttribute('viewBox') && width && height) svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }
}

async function renderChartMarkup(spec, stageWidth) {
  await nextFrame()

  const stage = createStage(stageWidth)
  const root = createRoot(stage)

  try {
    flushSync(() => root.render(createElement(ChartBlock, { data: spec, animate: false, width: stageWidth })))
    await waitUntilSettled(stage)
    ensureScalableSvg(stage)
    return stage.innerHTML
  } finally {
    root.unmount()
    stage.remove()
  }
}

export async function inlineArtifactCharts(html, containerWidth = null) {
  if (!html.includes('data-chart')) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const nodes = [...doc.querySelectorAll('[data-chart]')]
  if (nodes.length === 0) return html

  const stageWidth = chartStageWidth(containerWidth)

  for (const node of nodes) {
    node.innerHTML = await renderChartMarkup(node.getAttribute('data-chart'), stageWidth)
  }

  return doc.head.innerHTML + doc.body.innerHTML
}
