import { Blobatar } from '@blobatar/react'
import { useGaze } from '@blobatar/react/gaze'
import { happy, idle, sleepy, smug, surprised, thinking, wink } from 'blobatar/expression'
import 'blobatar/motion.css'
import 'blobatar/gaze.css'
import { BOT_AVATAR_SHAPES, BOT_AVATAR_TONES } from '../../constants.js'
import './BotAvatar.css'

const DEFAULT_SIZE = 32
const GAZE_TRAVEL = 3
const MOOD_EXPRESSIONS = { neutral: idle, happy, wink, smug, sleepy, surprised }

function positionOf(options, id) {
  return options.find(option => option.id === id)?.position
}

function pinnedTraits(avatarStyle) {
  const shape = positionOf(BOT_AVATAR_SHAPES, avatarStyle?.shape)
  if (shape === undefined) return undefined

  return { shape }
}

function resolveExpression(avatarStyle, isThinking) {
  if (isThinking) return thinking

  return MOOD_EXPRESSIONS[avatarStyle?.mood] ?? idle
}

export default function BotAvatar({
  seed,
  avatarStyle = null,
  size = DEFAULT_SIZE,
  className,
  animate = 'always',
  isThinking = false,
  isFollowingPointer = false,
}) {
  const gaze = useGaze({ travel: GAZE_TRAVEL, lookAt: 'pointer' })
  const classes = className ? `bot-avatar ${className}` : 'bot-avatar'

  return (
    <Blobatar
      ref={isFollowingPointer ? gaze.ref : undefined}
      name={seed}
      size={size}
      className={classes}
      animate={animate}
      hue={avatarStyle?.hue}
      tone={positionOf(BOT_AVATAR_TONES, avatarStyle?.tone)}
      traits={pinnedTraits(avatarStyle)}
      expression={resolveExpression(avatarStyle, isThinking)}
    />
  )
}
