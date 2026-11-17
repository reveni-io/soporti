import { Link } from 'react-router-dom'
import { ROUTES } from '../../../router/constants.js'
import './BotNotFound.css'

export default function BotNotFound({ loading }) {
  if (loading) {
    return (
      <div className="bot-not-found">
        <p className="bot-not-found__text">Loading…</p>
      </div>
    )
  }

  return (
    <div className="bot-not-found">
      <h2 className="bot-not-found__title">Bot not found.</h2>
      <p className="bot-not-found__text">It may have been deleted.</p>
      <Link className="btn btn--secondary" to={ROUTES.BOTS}>
        Back to bots
      </Link>
    </div>
  )
}
