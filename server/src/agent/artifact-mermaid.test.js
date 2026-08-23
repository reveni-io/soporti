import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('beautiful-mermaid', () => ({
  renderMermaid: vi.fn(),
}))

const { renderMermaid } = await import('beautiful-mermaid')
const { inlineArtifactMermaid } = await import('./artifact-mermaid.js')
const { MERMAID_RENDER_COLORS } = await import('../constants.js')

describe('inlineArtifactMermaid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderMermaid.mockResolvedValue('<svg>diagram</svg>')
  })

  it('returns the html untouched when there is no mermaid block', async () => {
    const html = '<h1>Report</h1><pre><code class="language-python">print()</code></pre>'

    await expect(inlineArtifactMermaid(html)).resolves.toBe(html)
    expect(renderMermaid).not.toHaveBeenCalled()
  })

  it('replaces a mermaid pre block with the rendered diagram', async () => {
    const result = await inlineArtifactMermaid('<h1>Flow</h1><pre class="mermaid">flowchart TD\n    A --&gt; B</pre>')

    expect(result).toBe('<h1>Flow</h1><div class="mermaid-diagram"><svg>diagram</svg></div>')
    expect(renderMermaid).toHaveBeenCalledWith('flowchart TD\n    A --> B', MERMAID_RENDER_COLORS)
  })

  it('replaces a code block tagged as mermaid, the fenced-markdown habit', async () => {
    const result = await inlineArtifactMermaid(
      '<pre><code class="language-mermaid">graph LR\n    A --&gt; B</code></pre>'
    )

    expect(result).toBe('<div class="mermaid-diagram"><svg>diagram</svg></div>')
    expect(renderMermaid).toHaveBeenCalledWith('graph LR\n    A --> B', MERMAID_RENDER_COLORS)
  })

  it('unwraps a code tag nested inside a mermaid pre block', async () => {
    await inlineArtifactMermaid('<pre class="mermaid"><code>flowchart TD\n    A --&gt; B</code></pre>')

    expect(renderMermaid).toHaveBeenCalledWith('flowchart TD\n    A --> B', MERMAID_RENDER_COLORS)
  })

  it('decodes the entities the agent escaped in the source', async () => {
    await inlineArtifactMermaid('<pre class="mermaid">flowchart TD\n    A[&quot;Q &amp; A&quot;] --&gt; B</pre>')

    expect(renderMermaid).toHaveBeenCalledWith('flowchart TD\n    A["Q & A"] --> B', MERMAID_RENDER_COLORS)
  })

  it('renders every diagram in the document', async () => {
    renderMermaid.mockResolvedValueOnce('<svg>one</svg>').mockResolvedValueOnce('<svg>two</svg>')

    const result = await inlineArtifactMermaid(
      '<pre class="mermaid">flowchart TD</pre><p>and</p><pre class="mermaid">graph LR</pre>'
    )

    expect(result).toBe(
      '<div class="mermaid-diagram"><svg>one</svg></div><p>and</p><div class="mermaid-diagram"><svg>two</svg></div>'
    )
  })

  it('keeps the source block when the diagram does not render', async () => {
    renderMermaid.mockRejectedValue(new Error('parse error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const html = '<pre class="mermaid">not a diagram</pre>'

    await expect(inlineArtifactMermaid(html)).resolves.toBe(html)
  })

  it('leaves highlighted code blocks alone even in a document with diagrams', async () => {
    const result = await inlineArtifactMermaid(
      '<pre class="mermaid">flowchart TD</pre><pre><code class="language-js">let a = 1</code></pre>'
    )

    expect(result).toContain('<pre><code class="language-js">let a = 1</code></pre>')
    expect(renderMermaid).toHaveBeenCalledTimes(1)
  })
})
