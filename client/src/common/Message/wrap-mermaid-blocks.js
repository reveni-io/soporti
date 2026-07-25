const MERMAID_START =
  /^(flowchart|graph|erDiagram|sequenceDiagram|classDiagram|stateDiagram|pie|gantt|journey|gitGraph|mindmap|timeline|quadrantChart|xychart|block-beta|architecture)\b/

const MERMAID_CONTINUATION = /^(subgraph|end|style|classDef|linkStyle)\b/

const FENCE = '```'

export function wrapMermaidBlocks(text) {
  const lines = text.split('\n')
  const result = []
  let inFence = false
  let mermaidBuf = null

  function flushMermaid() {
    if (mermaidBuf && mermaidBuf.length > 1) {
      result.push(`${FENCE}mermaid`, ...mermaidBuf, FENCE, '')
    } else if (mermaidBuf) {
      result.push(...mermaidBuf)
    }
    mermaidBuf = null
  }

  for (const line of lines) {
    if (line.trimStart().startsWith(FENCE)) {
      flushMermaid()
      inFence = !inFence
      result.push(line)
      continue
    }

    if (inFence) {
      result.push(line)
      continue
    }

    if (!mermaidBuf && MERMAID_START.test(line.trim())) {
      mermaidBuf = [line]
      continue
    }

    if (mermaidBuf) {
      if (/^\s/.test(line) || line.trim() === '' || MERMAID_CONTINUATION.test(line.trim())) {
        mermaidBuf.push(line)
        continue
      }
      flushMermaid()
    }

    result.push(line)
  }

  flushMermaid()
  return result.join('\n')
}
