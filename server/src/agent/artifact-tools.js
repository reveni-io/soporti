import { z } from 'zod'
import { tool } from '@openai/agents'
import { saveArtifactVersion } from '../db/artifacts.js'
import { inlineArtifactMermaid } from './artifact-mermaid.js'
import { ARTIFACT_IDENTIFIER_RE, MAX_ARTIFACT_HTML_CHARS, MAX_ARTIFACT_TITLE_LENGTH } from '../constants.js'

const IDENTIFIER_DESCRIPTION =
  'Stable slug naming this artifact, lowercase letters, digits and dashes (e.g. "refund-dashboard"). Reuse the SAME identifier to publish a new version of an artifact you already created in this conversation; only pick a new one for a genuinely different artifact.'

const HTML_DESCRIPTION =
  'The complete document body: HTML, plus any CSS in a <style> tag and any JS in a <script> tag. Do NOT include <!doctype>, <html>, <head> or <body> tags — the app wraps it. Rewrite it in full on every version, never a partial or a diff. It runs sandboxed with no network access, so inline everything and never fetch a remote asset. For charts, emit an empty <div data-chart=\'{...}\'></div> whose attribute holds the same JSON spec as a chart block — the app renders it with its own charting library; never draw a chart yourself. For diagrams, emit a <pre class="mermaid"> block holding plain mermaid source — the app replaces it with the rendered diagram; never draw boxes and arrows yourself. Code samples in <pre><code class="language-..."> blocks are syntax-highlighted by the app.'

export function buildArtifactTools(conversationId, onPublished) {
  if (!conversationId) return []

  return [
    tool({
      name: 'render_artifact',
      description:
        'Publish an artifact — a self-contained page of HTML, CSS and JS — into a side panel next to the conversation. Use it for substantial, self-contained deliverables the user will keep, share, print or iterate on: documents first (reports, runbooks, guides, postmortems), and interactive pages (dashboards, explorers, calculators, forms) when the user needs to operate the result. Publishing the same identifier again replaces it with a new version and the user can switch between them.',
      parameters: z.object({
        identifier: z.string().describe(IDENTIFIER_DESCRIPTION),
        title: z.string().describe('Short human title shown in the panel header and in the chat card.'),
        html: z.string().describe(HTML_DESCRIPTION),
      }),
      execute: async input => {
        const identifier = input.identifier.trim().toLowerCase()
        if (!ARTIFACT_IDENTIFIER_RE.test(identifier)) {
          return JSON.stringify({
            error: 'Invalid identifier. Use lowercase letters, digits and dashes, starting with a letter or digit.',
          })
        }

        const title = input.title.trim().slice(0, MAX_ARTIFACT_TITLE_LENGTH)
        if (!title) return JSON.stringify({ error: 'Title is required.' })

        if (!input.html.trim()) {
          return JSON.stringify({ error: 'The artifact is empty. Write its full markup and publish again.' })
        }

        if (input.html.length > MAX_ARTIFACT_HTML_CHARS) {
          return JSON.stringify({
            error: `Artifact is too large (${input.html.length} characters, maximum ${MAX_ARTIFACT_HTML_CHARS}). Simplify it and publish again.`,
          })
        }

        const html = await inlineArtifactMermaid(input.html)
        const saved = await saveArtifactVersion(conversationId, { identifier, title, html })

        onPublished?.({ artifactId: saved.id, title: saved.title, version: saved.version })

        return JSON.stringify({
          published: `"${saved.title}" is now open in the side panel as version ${saved.version}.`,
          reminder: 'Do not repeat its content in your reply.',
        })
      },
    }),
  ]
}
