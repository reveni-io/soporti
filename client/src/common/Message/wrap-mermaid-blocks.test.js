import { describe, it, expect } from 'vitest'
import { wrapMermaidBlocks } from './wrap-mermaid-blocks.js'

describe('wrapMermaidBlocks', () => {
  it('leaves plain prose untouched', () => {
    const text = 'The signup flow validates the email first.\n\nThen it creates the account.'

    expect(wrapMermaidBlocks(text)).toBe(text)
  })

  it('fences a bare mermaid diagram', () => {
    const text = 'flowchart TD\n  A[Start] --> B[End]'

    expect(wrapMermaidBlocks(text)).toBe('```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```\n')
  })

  it('keeps a single-line diagram header unfenced', () => {
    const text = 'graph LR'

    expect(wrapMermaidBlocks(text)).toBe('graph LR')
  })

  it('absorbs indented lines, blank lines and mermaid keywords into the diagram', () => {
    const text = ['sequenceDiagram', '  A->>B: hi', '', 'end', 'style A fill:#fff'].join('\n')

    expect(wrapMermaidBlocks(text)).toBe(
      ['```mermaid', 'sequenceDiagram', '  A->>B: hi', '', 'end', 'style A fill:#fff', '```', ''].join('\n')
    )
  })

  it('stops the diagram at the first unindented prose line', () => {
    const text = ['flowchart TD', '  A --> B', 'That is the whole flow.'].join('\n')

    expect(wrapMermaidBlocks(text)).toBe(
      ['```mermaid', 'flowchart TD', '  A --> B', '```', '', 'That is the whole flow.'].join('\n')
    )
  })

  it('never touches content already inside a fence', () => {
    const text = ['```js', 'const graph = 1', '```'].join('\n')

    expect(wrapMermaidBlocks(text)).toBe(text)
  })

  it('does not re-wrap a diagram that is already fenced', () => {
    const text = ['```mermaid', 'flowchart TD', '  A --> B', '```'].join('\n')

    expect(wrapMermaidBlocks(text)).toBe(text)
  })

  it('wraps a diagram that follows a fenced code block', () => {
    const text = ['```js', 'const a = 1', '```', 'erDiagram', '  A ||--o{ B : has'].join('\n')

    expect(wrapMermaidBlocks(text)).toBe(
      ['```js', 'const a = 1', '```', '```mermaid', 'erDiagram', '  A ||--o{ B : has', '```', ''].join('\n')
    )
  })

  it('flushes a diagram that runs to the end of the text', () => {
    const text = ['Intro.', 'pie title Reasons', '  "Wrong size" : 38'].join('\n')

    expect(wrapMermaidBlocks(text)).toBe(
      ['Intro.', '```mermaid', 'pie title Reasons', '  "Wrong size" : 38', '```', ''].join('\n')
    )
  })
})
