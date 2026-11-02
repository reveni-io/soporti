import { chromium } from 'playwright-core'
import { readBundleProject } from './bundle.js'

const LAUNCH_ARGS = [
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--host-resolver-rules=MAP * ~NOTFOUND',
  '--proxy-server=127.0.0.1:9',
  '--proxy-bypass-list=<-loopback>',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
]
const ENV_KEYS = new Set(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LANGUAGE', 'TZ', 'PLAYWRIGHT_BROWSERS_PATH'])
const ENV_PREFIXES = ['LC_', 'FONTCONFIG_', 'XDG_']
const BOOT_TIMEOUT_MS = 60_000
const MAX_PROBLEMS = 20
const MAX_URL_LENGTH = 160
const RESOURCE_FAILURE_PREFIX = 'Failed to load resource'
const STACK_FRAME_RE = /^\s*at .+$/m

export function isolatedEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => ENV_KEYS.has(key) || ENV_PREFIXES.some(prefix => key.startsWith(prefix)))
  )
}

export function launchBrowser() {
  return chromium.launch({ args: LAUNCH_ARGS, env: isolatedEnv() })
}

function removePeerConnections() {
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) delete globalThis[name]
}

export function withTimeout(promise, { timeoutMs, message }) {
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function shorten(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function record(list, sentence) {
  if (list.length >= MAX_PROBLEMS || list.includes(sentence)) return
  list.push(sentence)
}

export function describePageError(error) {
  const frame = STACK_FRAME_RE.exec(error.stack ?? '')?.[0].trim()
  const where = frame ? ` (${frame})` : ''
  return `The page threw ${error.name}: ${error.message}${where}.`
}

function describeBlockedRequest(url) {
  return `The page tried to load ${shorten(url, MAX_URL_LENGTH)}: network access is blocked, bundle the file as an asset.`
}

function handleConsoleMessage(message, problems) {
  if (message.type() !== 'error' || message.text().startsWith(RESOURCE_FAILURE_PREFIX)) return
  record(problems.warnings, `The page logged an error: ${message.text()}`)
}

function blockRequest(route, problems) {
  record(problems.errors, describeBlockedRequest(route.request().url()))
  return route.abort('blockedbyclient').catch(() => {})
}

function blockWebSocket(socket, problems) {
  record(problems.errors, describeBlockedRequest(socket.url()))
  return socket.close()
}

async function waitForBoot(page, html) {
  try {
    await page.setContent(html, { timeout: BOOT_TIMEOUT_MS })
    await page.waitForFunction(() => globalThis.__ready === true || Boolean(globalThis.__error), null, {
      timeout: BOOT_TIMEOUT_MS,
    })
  } catch {
    return `The page did not set __ready within ${BOOT_TIMEOUT_MS / 1000} s: check that R.video() is called once and that init(stage) returns.`
  }

  const error = await page.evaluate(() => globalThis.__error || null)
  return error ? `The page failed to boot: ${error}` : null
}

export async function openProjectPage(browser, html) {
  const project = readBundleProject(html)
  const problems = { errors: [], warnings: [] }
  const context = await browser.newContext({
    viewport: { width: project.width, height: project.height },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  })

  await context.addInitScript(removePeerConnections)
  await context.route('**/*', route => blockRequest(route, problems))
  await context.routeWebSocket(/.*/, socket => blockWebSocket(socket, problems))

  const page = await context.newPage()
  page.on('pageerror', error => record(problems.errors, describePageError(error)))
  page.on('console', message => handleConsoleMessage(message, problems))

  const bootError = await waitForBoot(page, html)
  return { context, page, project, problems, bootError }
}
