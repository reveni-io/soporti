import { useEffect, useState } from 'react'
import { renderMermaid } from '../../services/services.js'

export default function MermaidDiagram({ chart, token }) {
  const [svg, setSvg] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!chart) return

    let cancelled = false

    renderMermaid(token, chart)
      .then(data => {
        if (!cancelled) {
          setSvg(data.svg)
          setError(false)
        }
      })
      .catch(err => {
        console.warn('[MermaidDiagram] server render failed:', err.message) // eslint-disable-line no-console
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [chart, token])

  if (svg && !error) {
    return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
  }

  if (error) {
    return (
      <pre className="mermaid-diagram mermaid-diagram--error">
        <code>{chart}</code>
      </pre>
    )
  }

  return (
    <pre className="mermaid-diagram mermaid-diagram--pending">
      <code>{chart}</code>
    </pre>
  )
}
