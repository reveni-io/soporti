import { describe, it, expect } from 'vitest'
import { bundleProject, escapeInlineScript, escapeInlineStyle, inlineAssetUrls, readBundleProject } from './bundle.js'
import { VideoProjectError } from './project-error.js'

const KIT = {
  scripts: [
    { name: 'core.js', content: 'window.KIT_CORE = 1' },
    { name: 'synth.js', content: 'window.KIT_SYNTH = 1' },
  ],
  runtime: 'window.KIT_RUNTIME = 1',
}

function projectJson(overrides = {}) {
  return JSON.stringify({
    title: 'Liquid & <templates>',
    width: 1920,
    height: 1080,
    fps: 60,
    scripts: ['data.js', 'scenes.js'],
    styles: ['style.css'],
    ...overrides,
  })
}

function projectFiles(overrides = {}) {
  return {
    'project.json': projectJson(),
    'data.js': 'window.DATA = 1',
    'scenes.js': 'window.SCENES = 1',
    'style.css': '#stage { color: red; }',
    ...overrides,
  }
}

function catchError(run) {
  try {
    run()
  } catch (error) {
    return error
  }
  return null
}

describe('bundleProject', () => {
  it('builds one document with the boot globals, the kit and the project scripts in order', () => {
    const { html, project } = bundleProject({ files: projectFiles(), kit: KIT, mode: 'render' })
    const order = ['window.__MODE__', 'KIT_CORE', 'KIT_SYNTH', 'window.DATA', 'window.SCENES', 'KIT_RUNTIME']
    const positions = order.map(marker => html.indexOf(marker))

    expect(
      html.startsWith('<!doctype html><html><head><meta charset="utf-8"><title>Liquid &amp; &lt;templates&gt;</title>')
    ).toBe(true)
    expect(html).toContain('<style>#stage { color: red; }</style>')
    expect(html).toContain('<div id="stage"></div>')
    expect(html).toContain('window.__MODE__ = "render"')
    expect(html).toContain('window.__ASSETS__ = {}')
    expect(positions.every(position => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(html).toContain('//# sourceURL=scenes.js')
    expect(html).toContain('//# sourceURL=kit/runtime.js')
    expect(project).toEqual({
      title: 'Liquid & <templates>',
      width: 1920,
      height: 1080,
      fps: 60,
      scripts: ['data.js', 'scenes.js'],
      styles: ['style.css'],
    })
  })

  it('exposes the project and the assets as data URLs to the page', () => {
    const assets = { 'logo.svg': { mimeType: 'image/svg+xml', data: Buffer.from('<svg/>') } }

    const { html } = bundleProject({ files: projectFiles(), assets, kit: KIT, mode: 'preview' })

    expect(html).toContain('window.__MODE__ = "preview"')
    expect(readBundleProject(html)).toEqual({ title: 'Liquid & <templates>', width: 1920, height: 1080, fps: 60 })
    expect(html).toContain(
      `window.__ASSETS__ = {"logo.svg":"data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}"}`
    )
  })

  it('rewrites asset URLs in the styles to data URLs', () => {
    const files = projectFiles({
      'style.css':
        '@font-face { src: url("assets/inter.woff2"); } .a { background: url(assets/logo.png) } .b { mask: url( \'assets/logo.png\' ) }',
    })
    const assets = {
      'inter.woff2': { mimeType: 'font/woff2', data: Buffer.from('font') },
      'logo.png': { mimeType: 'image/png', data: Buffer.from('png') },
    }

    const { html } = bundleProject({ files, assets, kit: KIT, mode: 'render' })

    expect(html).toContain(`url("data:font/woff2;base64,${Buffer.from('font').toString('base64')}")`)
    expect(html.match(/url\("data:image\/png;base64,cG5n"\)/g)).toHaveLength(2)
    expect(html).not.toContain('assets/')
  })

  it('keeps a closing tag inside a file from ending its script or style', () => {
    const files = projectFiles({
      'scenes.js': 'const tag = "</script><script>alert(1)</script>"; const comment = "<!--"',
      'style.css': '.a::after { content: "</style>" }',
    })

    const { html } = bundleProject({ files, kit: KIT, mode: 'render' })

    expect(html.match(/<\/script>/g)).toHaveLength(6)
    expect(html.match(/<\/style>/g)).toHaveLength(1)
    expect(html).toContain('const tag = "\\x3C/script><script>alert(1)\\x3C/script>"; const comment = "\\x3C!--"')
  })

  it('accepts a project without styles', () => {
    const files = projectFiles({ 'project.json': projectJson({ styles: undefined }) })

    const { project } = bundleProject({ files, kit: KIT, mode: 'render' })

    expect(project.styles).toEqual([])
  })

  it.each([
    [{ 'project.json': undefined }, 'project.json is missing'],
    [{ 'project.json': '{ nope' }, 'project.json is not valid JSON'],
    [{ 'project.json': '[]' }, 'project.json must be a JSON object.'],
    [{ 'project.json': projectJson({ title: ' ' }) }, 'project.json needs a "title" of 1 to 200 characters.'],
    [
      { 'project.json': projectJson({ width: 1280, height: 720 }) },
      'project.json width×height must be one of 1920×1080 (16:9), 1080×1080 (1:1), 1080×1920 (9:16), got 1280×720.',
    ],
    [{ 'project.json': projectJson({ fps: 24 }) }, 'project.json fps must be 30 or 60, got 24.'],
    [
      { 'project.json': projectJson({ scripts: [] }) },
      'project.json "scripts" must be a non-empty array of .js file paths.',
    ],
    [
      { 'project.json': projectJson({ styles: 'style.css' }) },
      'project.json "styles" must be an array of .css file paths.',
    ],
    [
      { 'project.json': projectJson({ scripts: ['style.css'] }) },
      'project.json "scripts" lists "style.css": every entry must be a .js file.',
    ],
    [
      { 'project.json': projectJson({ scripts: ['missing.js'] }) },
      'project.json "scripts" lists "missing.js", but the project has no such file.',
    ],
    [
      { 'project.json': projectJson({ scripts: ['data.js', 'data.js'] }) },
      'project.json "scripts" lists "data.js" twice.',
    ],
    [{ 'Scenes.js': '' }, '"Scenes.js" is not a valid file path'],
    [{ 'assets/x.js': '' }, '"assets/x.js" is reserved'],
    [{ 'kit/core.js': '' }, '"kit/core.js" is reserved'],
    [{ 'notes.md': '' }, '"notes.md" has an unsupported extension'],
    [{ 'data.json': 42 }, '"data.json" must be text.'],
    [{ 'big.js': 'x'.repeat(400 * 1024 + 1) }, '"big.js" is 401 KB: a file can be at most 400 KB.'],
  ])('rejects an invalid project (%#)', (overrides, message) => {
    const files = Object.fromEntries(
      Object.entries(projectFiles(overrides)).filter(([, content]) => content !== undefined)
    )

    const error = catchError(() => bundleProject({ files, kit: KIT, mode: 'render' }))

    expect(error).toBeInstanceOf(VideoProjectError)
    expect(error.message).toContain(message)
  })

  it('limits the number and the total size of the files', () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`f${index}.js`, '']))
    const heavy = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`h${index}.js`, 'x'.repeat(390 * 1024)]))

    const tooMany = catchError(() => bundleProject({ files: projectFiles(many), kit: KIT, mode: 'render' }))
    const tooHeavy = catchError(() => bundleProject({ files: projectFiles(heavy), kit: KIT, mode: 'render' }))

    expect(tooMany.message).toBe('The project has 44 files: the limit is 40.')
    expect(tooHeavy.message).toBe('The project files add up to 2.3 MB: the limit is 2.0 MB.')
  })

  it.each([
    [{ 'Logo.svg': { data: Buffer.from('') } }, '"Logo.svg" is not a valid asset name'],
    [{ 'clip.mp4': { data: Buffer.from('') } }, 'Asset "clip.mp4" is not a font'],
    [
      { 'big.png': { data: Buffer.alloc(2 * 1024 * 1024 + 1) } },
      'Asset "big.png" is 2.0 MB: an asset can be at most 2.0 MB.',
    ],
  ])('rejects an invalid asset (%#)', (assets, message) => {
    const error = catchError(() => bundleProject({ files: projectFiles(), assets, kit: KIT, mode: 'render' }))

    expect(error).toBeInstanceOf(VideoProjectError)
    expect(error.message).toContain(message)
  })

  it('limits the total size of the assets', () => {
    const assets = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`i${index}.png`, { data: Buffer.alloc(2 * 1024 * 1024) }])
    )

    const error = catchError(() => bundleProject({ files: projectFiles(), assets, kit: KIT, mode: 'render' }))

    expect(error.message).toBe('The assets add up to 16.0 MB: the limit is 15.0 MB.')
  })
})

describe('inlineAssetUrls', () => {
  it('names the missing asset and the ones available', () => {
    const run = () =>
      inlineAssetUrls('a { background: url("assets/missing.png") }', {
        path: 'style.css',
        assetUrls: { 'logo.svg': 'data:x' },
      })

    expect(run).toThrow(VideoProjectError)
    expect(run).toThrow(
      'style.css uses assets/missing.png, but the video has no asset with that name. Available assets: logo.svg.'
    )
  })

  it('says when the video has no assets at all', () => {
    expect(() => inlineAssetUrls('a { background: url(assets/x.png) }', { path: 'a.css', assetUrls: {} })).toThrow(
      'The video has no assets.'
    )
  })
})

describe('escaping', () => {
  it('escapes script terminators case-insensitively', () => {
    expect(escapeInlineScript('a </SCRIPT> b <!-- c < d')).toBe('a \\x3C/SCRIPT> b \\x3C!-- c < d')
  })

  it('escapes every angle bracket in styles', () => {
    expect(escapeInlineStyle('content: "</style>"')).toBe('content: "\\3c /style>"')
  })
})

describe('readBundleProject', () => {
  it('rejects HTML that is not a bundle', () => {
    expect(() => readBundleProject('<html></html>')).toThrow('The HTML is not a video bundle')
  })
})
