import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { buildArtifactDocument } from './artifact-document.js'
import { inlineArtifactCharts } from './inline-artifact-charts.js'
import { ARTIFACT_HEIGHT_MESSAGE, ARTIFACT_PRINT_MESSAGE } from './artifact-runtime.js'
import './ArtifactFrame.css'

const SANDBOX = 'allow-scripts allow-modals'
const INITIAL_HEIGHT = 320
const MAX_HEIGHT = 20_000

export default function ArtifactFrame({ html, title, ref }) {
  const frameRef = useRef(null)
  const shellRef = useRef(null)
  const [height, setHeight] = useState(INITIAL_HEIGHT)
  const [chartDocument, setChartDocument] = useState(null)

  const parentOrigin = window.location.origin
  const hasCharts = html.includes('data-chart')
  const plainDocument = useMemo(
    () => (hasCharts ? null : buildArtifactDocument(html, parentOrigin)),
    [hasCharts, html, parentOrigin]
  )

  useEffect(() => {
    setChartDocument(null)
    if (!hasCharts) return

    let active = true

    async function build() {
      const withCharts = await inlineArtifactCharts(html, shellRef.current?.clientWidth ?? 0)
      if (active) setChartDocument(buildArtifactDocument(withCharts, parentOrigin))
    }

    build()

    return () => {
      active = false
    }
  }, [hasCharts, html, parentOrigin])

  const srcDocument = plainDocument ?? chartDocument

  useEffect(() => {
    function handleMessage(event) {
      if (event.source !== frameRef.current?.contentWindow) return
      if (event.data?.type !== ARTIFACT_HEIGHT_MESSAGE) return

      const reported = Number(event.data.height)
      if (!Number.isFinite(reported) || reported <= 0) return

      setHeight(Math.min(Math.ceil(reported), MAX_HEIGHT))
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    setHeight(INITIAL_HEIGHT)
  }, [srcDocument])

  useImperativeHandle(ref, () => ({
    print() {
      frameRef.current?.contentWindow?.postMessage({ type: ARTIFACT_PRINT_MESSAGE }, '*')
    },
  }))

  return (
    <div ref={shellRef} className="artifact-frame__shell">
      {srcDocument && (
        <iframe
          ref={frameRef}
          className="artifact-frame"
          title={title}
          srcDoc={srcDocument}
          sandbox={SANDBOX}
          style={{ height: `${height}px` }}
        />
      )}
    </div>
  )
}
