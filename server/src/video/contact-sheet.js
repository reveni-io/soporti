import { launchBrowser, openProjectPage, withTimeout } from './browser.js'
import { VideoProjectError } from './project-error.js'

const MAX_SHEET_SIZE = 1568
const GAP = 6
const MAX_TILES = 24
const DEFAULT_COLUMNS = 4
const LABEL_SCALE = 0.045
const MIN_LABEL_PX = 12
const SEEK_TIMEOUT_MS = 30_000

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function sheetLayout({ count, columns, width, height }) {
  const cols = clamp(Math.round(columns) || DEFAULT_COLUMNS, 1, count)
  const rows = Math.ceil(count / cols)
  const widthFit = (MAX_SHEET_SIZE - GAP * (cols - 1)) / cols
  const heightFit = ((MAX_SHEET_SIZE - GAP * (rows - 1)) / rows) * (width / height)
  const tileWidth = Math.floor(Math.min(widthFit, heightFit, width))
  const tileHeight = Math.round((tileWidth * height) / width)

  return {
    columns: cols,
    rows,
    tileWidth,
    tileHeight,
    sheetWidth: cols * tileWidth + GAP * (cols - 1),
    sheetHeight: rows * tileHeight + GAP * (rows - 1),
  }
}

export function validateTimes(times) {
  const valid = Array.isArray(times) && times.length > 0 && times.length <= MAX_TILES
  if (!valid || !times.every(Number.isFinite)) {
    throw new VideoProjectError(`A contact sheet takes 1 to ${MAX_TILES} instants, in seconds.`)
  }
}

export function buildSheetHtml(tiles, layout) {
  const labelPx = Math.max(MIN_LABEL_PX, Math.round(layout.tileWidth * LABEL_SCALE))
  const figures = tiles
    .map(
      ({ t, png }) =>
        `<figure><img src="data:image/png;base64,${png.toString('base64')}"><span>${t.toFixed(2)} s</span></figure>`
    )
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; background: #555; }
main { display: grid; grid-template-columns: repeat(${layout.columns}, ${layout.tileWidth}px); gap: ${GAP}px; }
figure { position: relative; margin: 0; width: ${layout.tileWidth}px; height: ${layout.tileHeight}px; }
img { display: block; width: 100%; height: 100%; }
span { position: absolute; left: ${GAP}px; top: ${GAP}px; padding: 2px 7px; border-radius: 5px; background: rgba(0, 0, 0, 0.7); color: #fff; font: 600 ${labelPx}px/1.3 monospace; }
</style></head><body><main>${figures}</main></body></html>`
}

async function captureTile(page, t) {
  const seeking = page.evaluate(instant => globalThis.__seek(instant), t)
  await withTimeout(seeking, {
    timeoutMs: SEEK_TIMEOUT_MS,
    message: `__seek(${t}) did not return within ${SEEK_TIMEOUT_MS / 1000} s.`,
  })
  return page.screenshot({ type: 'png' })
}

async function captureTiles(page, times) {
  const tiles = []
  const errors = []

  for (const t of times) {
    try {
      tiles.push({ t, png: await captureTile(page, t) })
    } catch (error) {
      errors.push(`Seeking to ${t.toFixed(2)} s failed: ${error.message}`)
    }
  }
  return { tiles, errors }
}

async function composeSheet(browser, tiles, { width, height, columns }) {
  const layout = sheetLayout({ count: tiles.length, columns, width, height })
  const context = await browser.newContext({
    viewport: { width: layout.sheetWidth, height: layout.sheetHeight },
    deviceScaleFactor: 1,
  })
  await context.route('**/*', route => route.abort('blockedbyclient'))

  const page = await context.newPage()
  await page.setContent(buildSheetHtml(tiles, layout))
  await page.evaluate(() => Promise.all([...globalThis.document.images].map(image => image.decode())))

  const png = await page.screenshot({ type: 'png' })
  await context.close()
  return png
}

function clampTimes(times, duration) {
  if (!Number.isFinite(duration)) return times
  return times.map(t => clamp(t, 0, duration))
}

async function captureWithBrowser(browser, { html, times, columns }) {
  const session = await openProjectPage(browser, html)
  const { errors: pageErrors, warnings } = session.problems
  if (session.bootError) return { png: null, errors: [session.bootError, ...pageErrors, ...warnings] }

  const duration = await session.page.evaluate(() => globalThis.__meta?.duration)
  const { tiles, errors } = await captureTiles(session.page, clampTimes(times, duration))
  const png = tiles.length > 0 ? await composeSheet(browser, tiles, { ...session.project, columns }) : null

  return { png, errors: [...errors, ...pageErrors, ...warnings] }
}

export async function captureContactSheet({ html, times, columns = DEFAULT_COLUMNS }) {
  validateTimes(times)

  const browser = await launchBrowser()
  try {
    return await captureWithBrowser(browser, { html, times, columns })
  } finally {
    await browser.close()
  }
}
