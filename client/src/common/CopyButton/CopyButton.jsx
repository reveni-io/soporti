import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon/Icon.jsx'
import './CopyButton.css'

const COPIED_FEEDBACK_MS = 2000
const COPIED_ARIA_LABEL = 'Copied'
const ICON_SIZE = 14

export default function CopyButton({ text, ariaLabel, variant = 'surface' }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function handleCopy() {
    if (!navigator.clipboard) return

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
    })
  }

  return (
    <button
      type="button"
      className={`copy-button copy-button--${variant}`}
      onClick={handleCopy}
      aria-label={copied ? COPIED_ARIA_LABEL : ariaLabel}
    >
      <Icon name={copied ? 'check' : 'copy'} size={ICON_SIZE} />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}
