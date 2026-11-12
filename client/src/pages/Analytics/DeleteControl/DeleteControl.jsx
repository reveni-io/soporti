import { useState } from 'react'
import Icon from '../../../common/Icon/Icon.jsx'
import DeleteConfirm from '../DeleteConfirm/DeleteConfirm.jsx'

export default function DeleteControl({ label, question, busy, onDelete }) {
  const [isConfirming, setIsConfirming] = useState(false)

  if (isConfirming) {
    return (
      <DeleteConfirm question={question} busy={busy} onConfirm={onDelete} onCancel={() => setIsConfirming(false)} />
    )
  }

  return (
    <button type="button" className="btn btn--secondary btn--sm" onClick={() => setIsConfirming(true)}>
      <Icon name="trash" size={14} />
      {label}
    </button>
  )
}
