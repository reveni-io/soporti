import { useState } from 'react'
import './FeedbackButtons.css'

export default function FeedbackButtons({ feedbackId, authToken }) {
  const [status, setStatus] = useState(null)

  async function sendFeedback(useful) {
    setStatus(useful ? 'positive' : 'negative')
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ feedbackId, useful }),
      })
    } catch {
      // Feedback is best-effort
    }
  }

  if (status === 'positive') return <div className="feedback feedback--done">Thanks!</div>
  if (status === 'negative') return <div className="feedback feedback--done">Noted</div>

  return (
    <div className="feedback">
      <button className="feedback__btn" onClick={() => sendFeedback(true)} title="Helpful">
        👍
      </button>
      <button className="feedback__btn" onClick={() => sendFeedback(false)} title="Not helpful">
        👎
      </button>
    </div>
  )
}
