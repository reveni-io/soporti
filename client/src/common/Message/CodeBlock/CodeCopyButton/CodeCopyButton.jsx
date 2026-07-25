import { useEffect, useRef, useState } from 'react'
import Icon from '../../../Icon/Icon.jsx'

const COPIED_FEEDBACK_MS = 2000
const ICON_SIZE = 14

export default function CodeCopyButton({ code }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function handleCopy() {
    if (!navigator.clipboard) return

    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
    })
  }

  return (
    <button
      type="button"
      className="code-block__copy"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy code'}
    >
      <Icon name={copied ? 'check' : 'copy'} size={ICON_SIZE} />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}
