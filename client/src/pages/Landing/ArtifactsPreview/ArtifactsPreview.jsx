import { useEffect, useRef, useState } from 'react'
import './ArtifactsPreview.css'

const STAGE_IDLE = 0
const STAGE_ASKED = 1
const STAGE_PUBLISHED = 2
const STAGE_ITERATED = 3
const FINAL_STAGE = STAGE_ITERATED

const FIRST_QUESTION = 'Turn this month’s tickets into a report I can share'
const SECOND_QUESTION = 'Add the per-channel volume too'

const V1_BARS = [35, 60, 45, 75, 55]
const V2_BARS = [35, 60, 45, 75, 95]

export default function ArtifactsPreview() {
  const [stage, setStage] = useState(STAGE_IDLE)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setStage(FINAL_STAGE)
      return
    }

    let cancelled = false
    let started = false
    const timers = []
    const sleep = ms => new Promise(resolve => timers.push(setTimeout(resolve, ms)))

    async function play() {
      while (!cancelled) {
        setStage(STAGE_IDLE)
        await sleep(1100)
        if (cancelled) return

        setStage(STAGE_ASKED)
        await sleep(1500)
        if (cancelled) return

        setStage(STAGE_PUBLISHED)
        await sleep(3200)
        if (cancelled) return

        setStage(STAGE_ITERATED)
        await sleep(4200)
      }
    }

    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !started) {
            started = true
            io.unobserve(el)
            play()
          }
        })
      },
      { threshold: 0.3 }
    )
    io.observe(el)

    return () => {
      cancelled = true
      io.disconnect()
      timers.forEach(clearTimeout)
    }
  }, [])

  const asked = stage >= STAGE_ASKED
  const published = stage >= STAGE_PUBLISHED
  const iterated = stage >= STAGE_ITERATED
  const version = iterated ? 2 : 1
  const bars = iterated ? V2_BARS : V1_BARS

  return (
    <div className="lp-artifacts-preview" ref={ref} aria-hidden="true">
      <div className="lp-artifacts-preview__window">
        <div className="lp-artifacts-preview__bar">
          <span className="lp-artifacts-preview__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="lp-artifacts-preview__bar-title">Soporti</span>
          {published && <span className="lp-artifacts-preview__chip">artifact published</span>}
        </div>

        <div className="lp-artifacts-preview__stage">
          <div className="lp-artifacts-preview__chat">
            {!asked && <p className="lp-artifacts-preview__hint">Ask for a deliverable — a report, a runbook.</p>}
            {asked && (
              <div className="message message--user">
                <div className="message__bubble message__bubble--user">{FIRST_QUESTION}</div>
              </div>
            )}
            {published && (
              <div className="lp-artifacts-preview__card">
                <span className="lp-artifacts-preview__card-icon">▤</span>
                <span className="lp-artifacts-preview__card-info">
                  <span className="lp-artifacts-preview__card-title">Monthly support report</span>
                  <span className="lp-artifacts-preview__card-meta">Version {version} · Click to open</span>
                </span>
              </div>
            )}
            {iterated && (
              <div className="message message--user">
                <div className="message__bubble message__bubble--user">{SECOND_QUESTION}</div>
              </div>
            )}
          </div>

          {published && (
            <div className="lp-artifacts-preview__panel">
              <div className="lp-artifacts-preview__panel-bar">
                <span className="lp-artifacts-preview__select">Version {version} ▾</span>
                <span className="lp-artifacts-preview__btn">PDF</span>
                <span className="lp-artifacts-preview__btn">Share</span>
              </div>
              <div className="lp-artifacts-preview__doc">
                <span className="lp-artifacts-preview__doc-eyebrow">Support · July</span>
                <span className="lp-artifacts-preview__doc-title">Monthly support report</span>
                <div className="lp-artifacts-preview__doc-stats">
                  <span className="lp-artifacts-preview__doc-stat">
                    <strong>{iterated ? '1,412' : '1,248'}</strong> tickets
                  </span>
                  <span className="lp-artifacts-preview__doc-stat">
                    <strong>{iterated ? '94%' : '92%'}</strong> CSAT
                  </span>
                </div>
                <div className="lp-artifacts-preview__doc-chart">
                  {bars.map((height, i) => (
                    <span key={i} className="lp-artifacts-preview__doc-bar" style={{ height: `${height}%` }} />
                  ))}
                </div>
                <span className="lp-artifacts-preview__doc-line" />
                <span className="lp-artifacts-preview__doc-line lp-artifacts-preview__doc-line--short" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
