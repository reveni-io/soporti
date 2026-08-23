import { describe, it, expect } from 'vitest'
import { act } from '@testing-library/react'
import { highlightArtifactCode } from './highlight-artifact-code.js'

function highlighted(html) {
  let result
  act(() => {
    result = highlightArtifactCode(html)
  })
  return result
}

describe('highlightArtifactCode', () => {
  it('returns the html untouched when no code block declares a language', () => {
    const html = '<h1>Report</h1><pre><code>plain text</code></pre>'

    expect(highlightArtifactCode(html)).toBe(html)
  })

  it('colors the tokens of a language-tagged code block', () => {
    const result = highlighted('<pre><code class="language-python">def encode(): return 1</code></pre>')

    expect(result).toContain('<span')
    expect(result).toContain('token')
  })

  it('keeps the code text intact', () => {
    const result = highlighted('<pre><code class="language-js">const answer = 42</code></pre>')

    const text = new DOMParser().parseFromString(result, 'text/html').body.textContent
    expect(text).toBe('const answer = 42')
  })

  it('highlights escaped markup as source instead of parsing it as elements', () => {
    const result = highlighted('<pre><code class="language-html">&lt;div class="x"&gt;&lt;/div&gt;</code></pre>')

    const text = new DOMParser().parseFromString(result, 'text/html').body.textContent
    expect(text).toBe('<div class="x"></div>')
  })

  it('keeps the surrounding document untouched', () => {
    const result = highlighted('<h1>Guide</h1><pre><code class="language-js">let a = 1</code></pre><p>after</p>')

    expect(result).toContain('<h1>Guide</h1>')
    expect(result).toContain('<p>after</p>')
  })

  it('highlights every code block in the document', () => {
    const result = highlighted(
      '<pre><code class="language-js">let a = 1</code></pre><pre><code class="language-python">b = 2</code></pre>'
    )

    expect(result.match(/<span/g).length).toBeGreaterThan(1)
  })

  it('leaves blocks the app renders through other pipelines alone', () => {
    const html = '<pre><code class="language-mermaid">flowchart TD\n    A --&gt; B</code></pre>'

    expect(highlightArtifactCode(html)).toBe(html)
  })

  it('keeps a style tag the parser moves into the head', () => {
    const result = highlighted(
      '<style>h1 { color: var(--text-primary); }</style><pre><code class="language-js">let a = 1</code></pre>'
    )

    expect(result).toContain('h1 { color: var(--text-primary); }')
    expect(result).toContain('<span')
  })

  it('cleans up the offscreen host it rendered into', () => {
    const before = document.body.children.length

    highlighted('<pre><code class="language-js">let a = 1</code></pre>')

    expect(document.body.children.length).toBe(before)
  })
})
