import { describe, it, expect } from 'vitest'
import { buildArtifactDocument } from './artifact-document.js'
import { ARTIFACT_HEIGHT_MESSAGE, ARTIFACT_PRINT_MESSAGE } from './artifact-runtime.js'

const ORIGIN = 'https://soporti.test'

describe('buildArtifactDocument', () => {
  it('wraps the model html in a full document', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document.startsWith('<!doctype html>')).toBe(true)
    expect(document).toContain('<h1>Refunds</h1>')
    expect(document).toContain('<meta charset="utf-8">')
  })

  it('blocks every fetch destination, so an artifact cannot call an API or load a remote asset', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain('http-equiv="Content-Security-Policy"')
    expect(document).toContain("default-src 'none'")
  })

  it('blocks form submission and base-uri rewriting, which do not inherit from default-src', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain("form-action 'none'")
    expect(document).toContain("base-uri 'none'")
  })

  it('still allows inline styles and scripts, so a dynamic artifact runs', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain("style-src 'unsafe-inline'")
    expect(document).toContain("script-src 'unsafe-inline'")
  })

  it('typesets bare document elements, so a plain document has real spacing', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain('max-width: 860px')
    expect(document).toContain('border-collapse: collapse')
    expect(document).toContain('font-family: var(--font-heading)')
    expect(document).toContain('vertical-align: middle')
    expect(document).toMatch(/\.alert,\n\.note,\n\[data-chart\] \{\n {2}margin: 0 0 var\(--sp4\);/)
  })

  it('loads the app fonts and nothing else from the network', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain('https://fonts.googleapis.com')
    expect(document).toContain("style-src 'unsafe-inline' https://fonts.googleapis.com")
    expect(document).toContain('font-src data: https://fonts.gstatic.com')
  })

  it('ships the document primitives, so a report can open like one', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    for (const primitive of ['.eyebrow', '.lede', '.stats', '.stat__value', 'figcaption', '.grid-2']) {
      expect(document).toContain(primitive)
    }
  })

  it('scales the snapshotted charts with their container', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain('.recharts-wrapper')
    expect(document).toContain('height: auto !important')
    expect(document).toContain('.recharts-legend-wrapper')
  })

  it('carries print rules, so an exported PDF reads like a document', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain('@media print')
    expect(document).toContain('break-inside: avoid')
  })

  it('embeds a runtime that prints the page when the app asks for a PDF', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain(ARTIFACT_PRINT_MESSAGE)
    expect(document).toContain('window.print()')
  })

  it('allows data-uri images and fonts, the only assets an artifact can carry', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain('img-src data:')
    expect(document).toContain('font-src data:')
  })

  it('injects the app design tokens, so an artifact styles itself like the rest of the app', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    for (const token of ['--text-primary:', '--bg-surface:', '--border-default:', '--sp4:', '--radius-md:']) {
      expect(document).toContain(token)
    }
  })

  it('injects the shared UI primitives, so an artifact can compose them instead of writing CSS', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    for (const primitive of ['.btn', '.btn--primary', '.input', '.card', '.badge', '.alert']) {
      expect(document).toContain(primitive)
    }
  })

  it('paints the artifact page as a surface, so it reads as a sheet rather than the app background', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document.lastIndexOf('background: var(--bg-surface)')).toBeGreaterThan(
      document.indexOf('background-color: var(--bg-app)')
    )
  })

  it('tints the card primitive so a grouped panel stays visible on that sheet', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document.lastIndexOf('background-color: var(--bg-cool)')).toBeGreaterThan(
      document.indexOf('background-color: var(--bg-surface)')
    )
  })

  it('hides the frame own vertical scrollbar, since the parent owns the height', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain('overflow-y: hidden')
  })

  it('measures the body rather than the document, so the frame can shrink as well as grow', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain('document.body.getBoundingClientRect()')
    expect(document).not.toContain('documentElement.scrollHeight')
  })

  it('releases the app full-height rule so the frame can report its real content height', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document.lastIndexOf('height: auto')).toBeGreaterThan(document.indexOf('height: 100%'))
  })

  it('posts the height back to the parent origin rather than to any listener', () => {
    const document = buildArtifactDocument('<h1>Refunds</h1>', ORIGIN)

    expect(document).toContain(JSON.stringify(ORIGIN))
    expect(document).toContain(ARTIFACT_HEIGHT_MESSAGE)
    expect(document).not.toContain("postMessage(msg, '*')")
  })

  it('puts the runtime after the content so it measures a rendered body', () => {
    const document = buildArtifactDocument('<h1 id="marker">Refunds</h1>', ORIGIN)

    expect(document.indexOf('id="marker"')).toBeLessThan(document.indexOf('ResizeObserver'))
  })
})
