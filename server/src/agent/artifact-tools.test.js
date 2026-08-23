import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/artifacts.js', () => ({
  saveArtifactVersion: vi.fn(),
}))

vi.mock('./artifact-mermaid.js', () => ({
  inlineArtifactMermaid: vi.fn(async html => html),
}))

const { saveArtifactVersion } = await import('../db/artifacts.js')
const { inlineArtifactMermaid } = await import('./artifact-mermaid.js')
const { buildArtifactTools } = await import('./artifact-tools.js')
const { MAX_ARTIFACT_HTML_CHARS, MAX_ARTIFACT_TITLE_LENGTH } = await import('../constants.js')

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111'
const ARTIFACT_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const SAVED = { id: ARTIFACT_ID, identifier: 'refund-dashboard', title: 'Refund dashboard', version: 1 }

let published

function renderTool() {
  return buildArtifactTools(CONVERSATION_ID, artifact => published.push(artifact))[0]
}

async function invoke(input) {
  return JSON.parse(await renderTool().invoke({}, JSON.stringify(input)))
}

describe('buildArtifactTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    published = []
    saveArtifactVersion.mockResolvedValue(SAVED)
  })

  it('registers render_artifact when the conversation can show a panel', () => {
    const tools = buildArtifactTools(CONVERSATION_ID, vi.fn())

    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('render_artifact')
  })

  it('registers nothing without a conversation, so Slack and scheduled runs cannot publish one', () => {
    expect(buildArtifactTools(null, vi.fn())).toEqual([])
    expect(buildArtifactTools(undefined, vi.fn())).toEqual([])
  })

  it('saves the version and hands the published artifact to the caller', async () => {
    await invoke({ identifier: 'refund-dashboard', title: 'Refund dashboard', html: '<h1>Hi</h1>' })

    expect(saveArtifactVersion).toHaveBeenCalledWith(CONVERSATION_ID, {
      identifier: 'refund-dashboard',
      title: 'Refund dashboard',
      html: '<h1>Hi</h1>',
    })
    expect(published).toEqual([{ artifactId: ARTIFACT_ID, title: 'Refund dashboard', version: 1 }])
  })

  it('tells the model the artifact is on screen without repeating its content', async () => {
    const result = await invoke({ identifier: 'refund-dashboard', title: 'Refund dashboard', html: '<h1>Hi</h1>' })

    expect(result.published).toContain('Refund dashboard')
    expect(result.published).toContain('version 1')
    expect(result.reminder).toMatch(/do not repeat/i)
  })

  it('publishes nothing when the input is rejected', async () => {
    await invoke({ identifier: 'not a slug', title: 'Refund dashboard', html: '<h1>Hi</h1>' })

    expect(published).toEqual([])
  })

  it('normalizes the identifier so a stray capital still hits the same artifact', async () => {
    await invoke({ identifier: '  Refund-Dashboard  ', title: 'Refund dashboard', html: '<h1>Hi</h1>' })

    expect(saveArtifactVersion).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({
        identifier: 'refund-dashboard',
      })
    )
  })

  it('rejects an identifier with characters that would not survive a URL', async () => {
    const result = await invoke({ identifier: 'refund dashboard!', title: 'Refund dashboard', html: '<h1>Hi</h1>' })

    expect(result.error).toMatch(/identifier/i)
    expect(saveArtifactVersion).not.toHaveBeenCalled()
  })

  it('rejects empty html instead of burning a version on an unviewable artifact', async () => {
    const result = await invoke({ identifier: 'refund-dashboard', title: 'Refund dashboard', html: '   \n  ' })

    expect(result.error).toMatch(/empty/i)
    expect(saveArtifactVersion).not.toHaveBeenCalled()
    expect(published).toEqual([])
  })

  it('rejects an empty title', async () => {
    const result = await invoke({ identifier: 'refund-dashboard', title: '   ', html: '<h1>Hi</h1>' })

    expect(result.error).toMatch(/title/i)
    expect(saveArtifactVersion).not.toHaveBeenCalled()
  })

  it('truncates an over-long title instead of failing the publish', async () => {
    await invoke({ identifier: 'refund-dashboard', title: 'T'.repeat(500), html: '<h1>Hi</h1>' })

    const { title } = saveArtifactVersion.mock.calls[0][1]
    expect(title).toHaveLength(MAX_ARTIFACT_TITLE_LENGTH)
  })

  it('saves the html with mermaid diagrams already rendered', async () => {
    inlineArtifactMermaid.mockResolvedValueOnce('<div class="mermaid-diagram"><svg>diagram</svg></div>')

    await invoke({
      identifier: 'refund-dashboard',
      title: 'Refund dashboard',
      html: '<pre class="mermaid">flowchart TD</pre>',
    })

    expect(inlineArtifactMermaid).toHaveBeenCalledWith('<pre class="mermaid">flowchart TD</pre>')
    expect(saveArtifactVersion).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({
        html: '<div class="mermaid-diagram"><svg>diagram</svg></div>',
      })
    )
  })

  it('rejects html over the size limit and tells the model to simplify', async () => {
    const result = await invoke({
      identifier: 'refund-dashboard',
      title: 'Refund dashboard',
      html: 'x'.repeat(MAX_ARTIFACT_HTML_CHARS + 1),
    })

    expect(result.error).toMatch(/too large/i)
    expect(saveArtifactVersion).not.toHaveBeenCalled()
  })
})
