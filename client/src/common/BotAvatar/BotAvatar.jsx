import { Blobatar } from '@blobatar/react'
import './BotAvatar.css'

const DEFAULT_SIZE = 32

export default function BotAvatar({ seed, size = DEFAULT_SIZE, className }) {
  const classes = className ? `bot-avatar ${className}` : 'bot-avatar'

  return <Blobatar name={seed} size={size} className={classes} />
}
