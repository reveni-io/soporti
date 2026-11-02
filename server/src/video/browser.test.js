import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('playwright-core', () => ({ chromium: { launch: vi.fn() } }))

const { chromium } = await import('playwright-core')
const { launchBrowser, openProjectPage, withTimeout, describePageError, isolatedEnv } = await import('./browser.js')

const HTML =
  '<script>window.__MODE__ = "render"\nwindow.__PROJECT__ = {"title":"T","width":1080,"height":1920,"fps":30}\n</script>'

function createPage({ bootError = null, waitFails = false } = {}) {
  const handlers = {}
  return {
    handlers,
    on: vi.fn((event, handler) => {
      handlers[event] = handler
    }),
    setContent: vi.fn().mockResolvedValue(),
    waitForFunction: waitFails ? vi.fn().mockRejectedValue(new Error('Timeout')) : vi.fn().mockResolvedValue(),
    evaluate: vi.fn().mockResolvedValue(bootError),
  }
}

function createBrowser(page) {
  const context = {
    route: vi.fn().mockResolvedValue(),
    routeWebSocket: vi.fn().mockResolvedValue(),
    addInitScript: vi.fn().mockResolvedValue(),
    newPage: vi.fn().mockResolvedValue(page),
  }
  return { context, browser: { newContext: vi.fn().mockResolvedValue(context) } }
}

function consoleMessage(type, text) {
  return { type: () => type, text: () => text }
}

describe('launchBrowser', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('launches the headless shell cut off from the network and from the server secrets', async () => {
    vi.stubEnv('JWT_SECRET', 'secret')
    vi.stubEnv('DATABASE_URL', 'postgresql://app')
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', '/ms-playwright')
    chromium.launch.mockResolvedValue('browser')

    const browser = await launchBrowser()
    const options = chromium.launch.mock.calls[0][0]

    expect(browser).toBe('browser')
    expect(chromium.launch).toHaveBeenCalledTimes(1)
    expect(options.args).toEqual([
      '--font-render-hinting=none',
      '--disable-lcd-text',
      '--host-resolver-rules=MAP * ~NOTFOUND',
      '--proxy-server=127.0.0.1:9',
      '--proxy-bypass-list=<-loopback>',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ])
    expect(options.env.PLAYWRIGHT_BROWSERS_PATH).toBe('/ms-playwright')
    expect(options.env).not.toHaveProperty('JWT_SECRET')
    expect(options.env).not.toHaveProperty('DATABASE_URL')
  })
})

describe('isolatedEnv', () => {
  it('keeps only what Chromium and the workers need', () => {
    const env = isolatedEnv({
      PATH: '/usr/bin',
      HOME: '/home/node',
      TMPDIR: '/tmp',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      TZ: 'UTC',
      FONTCONFIG_PATH: '/etc/fonts',
      XDG_CACHE_HOME: '/cache',
      PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
      DATABASE_URL: 'postgresql://app',
      JWT_SECRET: 'secret',
      NODE_OPTIONS: '--inspect',
      FFMPEG_PATH: '/usr/bin/ffmpeg',
    })

    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/node',
      TMPDIR: '/tmp',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      TZ: 'UTC',
      FONTCONFIG_PATH: '/etc/fonts',
      XDG_CACHE_HOME: '/cache',
      PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright',
    })
  })
})

describe('openProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens a page sized to the project and loads the bundle', async () => {
    const page = createPage()
    const { browser } = createBrowser(page)

    const session = await openProjectPage(browser, HTML)

    expect(browser.newContext).toHaveBeenCalledWith({
      viewport: { width: 1080, height: 1920 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    })
    expect(page.setContent).toHaveBeenCalledWith(HTML, { timeout: 60_000 })
    expect(session.bootError).toBeNull()
    expect(session.project).toEqual({ title: 'T', width: 1080, height: 1920, fps: 30 })
    expect(session.page).toBe(page)
  })

  it('removes WebRTC from every frame before the bundle runs', async () => {
    const page = createPage()
    const { browser, context } = createBrowser(page)
    globalThis.RTCPeerConnection = class {}
    globalThis.webkitRTCPeerConnection = class {}
    globalThis.RTCDataChannel = class {}

    await openProjectPage(browser, HTML)
    context.addInitScript.mock.calls[0][0]()

    expect(context.addInitScript).toHaveBeenCalledTimes(1)
    expect(context.addInitScript.mock.invocationCallOrder[0]).toBeLessThan(page.setContent.mock.invocationCallOrder[0])
    expect(globalThis.RTCPeerConnection).toBeUndefined()
    expect(globalThis.webkitRTCPeerConnection).toBeUndefined()
    expect(globalThis.RTCDataChannel).toBeUndefined()
  })

  it('blocks every request and websocket and says how to fix it', async () => {
    const page = createPage()
    const { browser, context } = createBrowser(page)
    const route = {
      request: () => ({ url: () => `https://fonts.example.com/${'a'.repeat(200)}` }),
      abort: vi.fn().mockRejectedValue(new Error('closed')),
    }
    const socket = { url: () => 'wss://live.example.com', close: vi.fn() }

    const session = await openProjectPage(browser, HTML)
    await context.route.mock.calls[0][1](route)
    context.routeWebSocket.mock.calls[0][1](socket)

    expect(context.route.mock.calls[0][0]).toBe('**/*')
    expect(route.abort).toHaveBeenCalledWith('blockedbyclient')
    expect(socket.close).toHaveBeenCalledTimes(1)
    expect(session.problems.errors[0]).toMatch(
      /^The page tried to load https:\/\/fonts\.example\.com\/a+…: network access is blocked, bundle the file as an asset\.$/
    )
    expect(session.problems.errors[1]).toBe(
      'The page tried to load wss://live.example.com: network access is blocked, bundle the file as an asset.'
    )
  })

  it('collects page errors and console errors without duplicates', async () => {
    const page = createPage()
    const { browser } = createBrowser(page)
    const error = new TypeError('stage is null')
    error.stack = 'TypeError: stage is null\n    at init (scenes.js:12:5)\n    at kit/runtime.js:3:1'

    const session = await openProjectPage(browser, HTML)
    page.handlers.pageerror(error)
    page.handlers.pageerror(error)
    page.handlers.console(consoleMessage('error', 'missing glyph'))
    page.handlers.console(consoleMessage('error', 'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT'))
    page.handlers.console(consoleMessage('log', 'hello'))

    expect(session.problems.errors).toEqual(['The page threw TypeError: stage is null (at init (scenes.js:12:5)).'])
    expect(session.problems.warnings).toEqual(['The page logged an error: missing glyph'])
  })

  it('keeps at most 20 problems', async () => {
    const page = createPage()
    const { browser } = createBrowser(page)

    const session = await openProjectPage(browser, HTML)
    for (let index = 0; index < 30; index += 1) page.handlers.console(consoleMessage('error', `problem ${index}`))

    expect(session.problems.warnings).toHaveLength(20)
  })

  it('reports a page that never becomes ready', async () => {
    const page = createPage({ waitFails: true })
    const { browser } = createBrowser(page)

    const session = await openProjectPage(browser, HTML)

    expect(session.bootError).toBe(
      'The page did not set __ready within 60 s: check that R.video() is called once and that init(stage) returns.'
    )
  })

  it('reports the boot error set by the page', async () => {
    const page = createPage({ bootError: 'R.video() was called twice' })
    const { browser } = createBrowser(page)

    const session = await openProjectPage(browser, HTML)

    expect(session.bootError).toBe('The page failed to boot: R.video() was called twice')
  })
})

describe('describePageError', () => {
  it('omits the location when the stack has none', () => {
    expect(describePageError({ name: 'Error', message: 'boom', stack: 'Error: boom' })).toBe(
      'The page threw Error: boom.'
    )
    expect(describePageError({ name: 'Error', message: 'boom' })).toBe('The page threw Error: boom.')
  })
})

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with the value when it arrives in time', async () => {
    await expect(withTimeout(Promise.resolve(7), { timeoutMs: 100, message: 'late' })).resolves.toBe(7)
  })

  it('rejects with the message when the promise takes too long', async () => {
    const pending = withTimeout(new Promise(() => {}), { timeoutMs: 100, message: '__seek hung' })
    const assertion = expect(pending).rejects.toThrow('__seek hung')

    await vi.advanceTimersByTimeAsync(100)
    await assertion
  })
})
