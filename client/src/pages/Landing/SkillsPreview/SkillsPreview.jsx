import { useEffect, useRef, useState } from 'react'
import './SkillsPreview.css'

const SKILLS = [
  { name: 'triage-ticket', description: 'Diagnose a support ticket end to end' },
  { name: 'trace-order', description: 'Follow an order across Shopify and the database' },
  { name: 'code-review', description: 'Review a branch against our standards' },
]

const PARTIAL = '/tr'
const COMMAND = '/triage-ticket'
const REST = 'the customer says the refund never arrived'

export default function SkillsPreview() {
  const [typed, setTyped] = useState('')
  const [sent, setSent] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setSent(true)
      return
    }

    let cancelled = false
    let started = false
    const timers = []
    const sleep = ms => new Promise(resolve => timers.push(setTimeout(resolve, ms)))

    async function play() {
      while (!cancelled) {
        setSent(false)
        setTyped('')
        await sleep(900)

        for (let i = 1; i <= PARTIAL.length; i++) {
          if (cancelled) return
          setTyped(PARTIAL.slice(0, i))
          await sleep(160)
        }
        await sleep(1300)
        if (cancelled) return

        setTyped(`${COMMAND} `)
        await sleep(700)

        for (let i = 1; i <= REST.length; i++) {
          if (cancelled) return
          setTyped(`${COMMAND} ${REST.slice(0, i)}`)
          await sleep(38)
        }
        await sleep(1200)
        if (cancelled) return

        setSent(true)
        setTyped('')
        await sleep(4800)
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

  const commandPrefix = typed.startsWith(COMMAND) ? COMMAND : ''
  const menuOpen = typed.startsWith('/') && !typed.includes(' ')
  const matchingSkills = menuOpen ? SKILLS.filter(skill => skill.name.startsWith(typed.slice(1))) : []

  return (
    <div className="lp-skills-preview" ref={ref} aria-hidden="true">
      <div className="lp-skills-preview__window">
        <div className="lp-skills-preview__bar">
          <span className="lp-skills-preview__dots">
            <span />
            <span />
            <span />
          </span>
          <span className="lp-skills-preview__bar-title">Soporti</span>
          <span className="lp-skills-preview__chip">{SKILLS.length} skills</span>
        </div>

        <div className="lp-skills-preview__body">
          {sent ? (
            <div className="message message--user">
              <div className="message__bubble message__bubble--user">
                <span className="lp-skills-preview__badge">{COMMAND}</span> {REST}
              </div>
            </div>
          ) : (
            <p className="lp-skills-preview__hint">Type “/” to run one of your skills.</p>
          )}
        </div>

        <div className="lp-skills-preview__composer">
          {matchingSkills.length > 0 && (
            <ul className="lp-skills-preview__menu">
              {matchingSkills.map((skill, i) => (
                <li
                  key={skill.name}
                  className={`lp-skills-preview__menu-item${i === 0 ? ' lp-skills-preview__menu-item--active' : ''}`}
                >
                  <span className="lp-skills-preview__menu-name">/{skill.name}</span>
                  <span className="lp-skills-preview__menu-description">{skill.description}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="lp-skills-preview__field">
            {typed ? (
              <span className="lp-skills-preview__typed">
                {commandPrefix && <span className="lp-skills-preview__command">{commandPrefix}</span>}
                {typed.slice(commandPrefix.length)}
                <span className="lp-skills-preview__caret" />
              </span>
            ) : (
              <span className="lp-skills-preview__placeholder">Ask Soporti anything...</span>
            )}
          </div>
          <span className="lp-skills-preview__send">&#8593;</span>
        </div>
      </div>
    </div>
  )
}
