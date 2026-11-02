import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./browser.js', async importOriginal => ({
  ...(await importOriginal()),
  launchBrowser: vi.fn(),
  openProjectPage: vi.fn(),
}))

const { launchBrowser, openProjectPage } = await import('./browser.js')
const { captureContactSheet, sheetLayout, validateTimes, buildSheetHtml } = await import('./contact-sheet.js')
const { VideoProjectError } = await import('./project-error.js')

function createSheetPage() {
  return {
    setContent: vi.fn().mockResolvedValue(),
    evaluate: vi.fn().mockResolvedValue([]),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('sheet')),
  }
}

function createBrowser(sheetPage) {
  const context = {
    route: vi.fn().mockResolvedValue(),
    newPage: vi.fn().mockResolvedValue(sheetPage),
    close: vi.fn().mockResolvedValue(),
  }
  return {
    context,
    browser: { newContext: vi.fn().mockResolvedValue(context), close: vi.fn().mockResolvedValue() },
  }
}

function createSession({ seek = () => {}, bootError = null } = {}) {
  globalThis.__meta = { duration: 4 }
  globalThis.__seek = seek
  return {
    page: {
      evaluate: async (fn, arg) => fn(arg),
      screenshot: vi.fn(async () => Buffer.from(`frame`)),
    },
    project: { title: 'T', width: 1920, height: 1080, fps: 30 },
    problems: { errors: ['The page threw Error: x.'], warnings: ['The page logged an error: y'] },
    bootError,
  }
}

describe('captureContactSheet', () => {
  let sheetPage
  let fake

  beforeEach(() => {
    vi.clearAllMocks()
    sheetPage = createSheetPage()
    fake = createBrowser(sheetPage)
    launchBrowser.mockResolvedValue(fake.browser)
  })

  afterEach(() => {
    delete globalThis.__meta
    delete globalThis.__seek
  })

  it('screenshots every instant and composes a labelled grid inside Chromium', async () => {
    const seen = []
    const session = createSession({ seek: t => seen.push(t) })
    openProjectPage.mockResolvedValue(session)

    const result = await captureContactSheet({ html: '<html>', times: [0, 1.5, 9], columns: 2 })

    expect(seen).toEqual([0, 1.5, 4])
    expect(session.page.screenshot).toHaveBeenCalledTimes(3)
    expect(fake.browser.newContext).toHaveBeenCalledWith({
      viewport: { width: 1568, height: 884 },
      deviceScaleFactor: 1,
    })
    expect(sheetPage.setContent.mock.calls[0][0]).toContain('<span>1.50 s</span>')
    expect(sheetPage.setContent.mock.calls[0][0]).toContain(
      `data:image/png;base64,${Buffer.from('frame').toString('base64')}`
    )
    expect(result).toEqual({
      png: Buffer.from('sheet'),
      errors: ['The page threw Error: x.', 'The page logged an error: y'],
    })
    expect(fake.browser.close).toHaveBeenCalledTimes(1)
  })

  it('reports the instants that failed and keeps the others', async () => {
    openProjectPage.mockResolvedValue(
      createSession({
        seek: t => {
          if (t === 2) throw new Error('boom')
        },
      })
    )

    const result = await captureContactSheet({ html: '<html>', times: [1, 2] })

    expect(result.errors[0]).toBe('Seeking to 2.00 s failed: boom')
    expect(sheetPage.setContent.mock.calls[0][0]).not.toContain('<span>2.00 s</span>')
  })

  it('returns no image when every instant failed', async () => {
    openProjectPage.mockResolvedValue(
      createSession({
        seek: () => {
          throw new Error('boom')
        },
      })
    )

    const result = await captureContactSheet({ html: '<html>', times: [1] })

    expect(result.png).toBeNull()
    expect(fake.browser.newContext).not.toHaveBeenCalled()
  })

  it('returns the boot error instead of an image', async () => {
    openProjectPage.mockResolvedValue(createSession({ bootError: 'The page failed to boot: nope' }))

    const result = await captureContactSheet({ html: '<html>', times: [1] })

    expect(result).toEqual({
      png: null,
      errors: ['The page failed to boot: nope', 'The page threw Error: x.', 'The page logged an error: y'],
    })
    expect(fake.browser.close).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid list of instants before launching a browser', async () => {
    await expect(captureContactSheet({ html: '<html>', times: [] })).rejects.toThrow(VideoProjectError)
    expect(launchBrowser).not.toHaveBeenCalled()
  })
})

describe('sheetLayout', () => {
  it('fits a 16:9 grid in 1568 px', () => {
    expect(sheetLayout({ count: 8, columns: 4, width: 1920, height: 1080 })).toEqual({
      columns: 4,
      rows: 2,
      tileWidth: 387,
      tileHeight: 218,
      sheetWidth: 1566,
      sheetHeight: 442,
    })
  })

  it('also keeps a tall grid within 1568 px', () => {
    const layout = sheetLayout({ count: 12, columns: 4, width: 1080, height: 1920 })

    expect(layout.rows).toBe(3)
    expect(layout.sheetHeight).toBeLessThanOrEqual(1568)
    expect(layout.sheetWidth).toBeLessThanOrEqual(1568)
  })

  it('never upscales a frame and never has more columns than tiles', () => {
    expect(sheetLayout({ count: 1, columns: 4, width: 1080, height: 1080 })).toMatchObject({
      columns: 1,
      tileWidth: 1080,
      sheetWidth: 1080,
    })
    expect(sheetLayout({ count: 3, columns: 0, width: 1920, height: 1080 }).columns).toBe(3)
  })
})

describe('validateTimes', () => {
  it.each([[undefined], [[]], [Array.from({ length: 25 }, () => 1)], [[1, Number.NaN]]])('rejects %j', times => {
    expect(() => validateTimes(times)).toThrow('A contact sheet takes 1 to 24 instants, in seconds.')
  })
})

describe('buildSheetHtml', () => {
  it('scales the label with the tile', () => {
    const html = buildSheetHtml([{ t: 0, png: Buffer.from('x') }], { columns: 1, tileWidth: 1000, tileHeight: 500 })

    expect(html).toContain('font: 600 45px/1.3 monospace')
    expect(html).toContain('grid-template-columns: repeat(1, 1000px)')
  })
})
