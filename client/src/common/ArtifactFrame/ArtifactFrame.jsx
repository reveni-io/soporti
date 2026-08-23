import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { buildArtifactDocument } from './artifact-document.js'
import { inlineArtifactCharts } from './inline-artifact-charts.js'
import { highlightArtifactCode } from './highlight-artifact-code.js'
import { ARTIFACT_HEIGHT_MESSAGE, ARTIFACT_PRINT_MESSAGE } from './artifact-runtime.js'
import './ArtifactFrame.css'

const SANDBOX = 'allow-scripts allow-modals'
const INITIAL_HEIGHT = 320
const MAX_HEIGHT = 20_000

export default function ArtifactFrame({ html, title, ref }) {
  const frameRef = useRef(null)
  const shellRef = useRef(null)
  const [height, setHeight] = useState(INITIAL_HEIGHT)
  const [inlinedDocument, setInlinedDocument] = useState(null)

  const parentOrigin = window.location.origin
  const needsInlining = html.includes('data-chart') || html.includes('language-')
  const plainDocument = useMemo(
    () => (needsInlining ? null : buildArtifactDocument(html, parentOrigin)),
    [needsInlining, html, parentOrigin]
  )

  useEffect(() => {
    setInlinedDocument(null)
    if (!needsInlining) return

    let active = true

    async function build() {
      const withCharts = await inlineArtifactCharts(html, shellRef.current?.clientWidth ?? 0)
      const highlighted = highlightArtifactCode(withCharts)
      if (active) setInlinedDocument(buildArtifactDocument(highlighted, parentOrigin))
    }

    build()

    return () => {
      active = false
    }
  }, [needsInlining, html, parentOrigin])

  const srcDocument = plainDocument ?? inlinedDocument

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
