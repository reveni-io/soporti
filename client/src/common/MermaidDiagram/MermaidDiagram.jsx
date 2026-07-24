import { useEffect, useState } from 'react'

export default function MermaidDiagram({ chart, token }) {
  const [svg, setSvg] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!chart) return

    let cancelled = false

    fetch(`${import.meta.env.VITE_API_URL}/api/mermaid/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ chart }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
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
