import { useId } from 'react'
import { palette, traits } from 'blobatar'
import BotAvatar from '../../../../common/BotAvatar/BotAvatar.jsx'
import Icon from '../../../../common/Icon/Icon.jsx'
import { BOT_AVATAR_COLORS, BOT_AVATAR_MOODS, BOT_AVATAR_SHAPES, BOT_AVATAR_TONES } from '../../../../constants.js'
import './AvatarStudio.css'

const STAGE_SIZE = 88
const SHAPE_SWATCH_SIZE = 28
const MOOD_SWATCH_SIZE = 30
const SHUFFLE_ICON_SIZE = 14
const SHUFFLE_LABEL = 'Shuffle avatar'
const FULL_TURN_DEGREES = 360
const COLOR_SWATCH_TONE = 'mid'

function bodyColor(hue, toneId) {
  const tone = BOT_AVATAR_TONES.find(option => option.id === toneId)

  return palette(hue, true, tone.position).head
}

function seedHue(seed) {
  return traits(seed).num('hue', 0, FULL_TURN_DEGREES)
}

function selectedColorId(hue) {
  return BOT_AVATAR_COLORS.find(color => color.hue === hue)?.id
}

export default function AvatarStudio({ seed, avatarStyle, isThinking, onPick, onShuffle }) {
  const hue = avatarStyle.hue ?? seedHue(seed)

  return (
    <div className="avatar-studio">
      <div className="avatar-studio__stage">
        <BotAvatar seed={seed} avatarStyle={avatarStyle} size={STAGE_SIZE} isThinking={isThinking} isFollowingPointer />
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          aria-label={SHUFFLE_LABEL}
          title={SHUFFLE_LABEL}
          onClick={onShuffle}
        >
          <Icon name="refresh" size={SHUFFLE_ICON_SIZE} />
          Shuffle
        </button>
      </div>

      <div className="avatar-studio__pickers">
        <SwatchPicker
          legend="Shape"
          options={BOT_AVATAR_SHAPES}
          selectedId={avatarStyle.shape}
          onSelect={shape => onPick('shape', shape.id)}
          renderSwatch={shape => (
            <BotAvatar
              seed={seed}
              avatarStyle={{ ...avatarStyle, shape: shape.id }}
              size={SHAPE_SWATCH_SIZE}
              animate="hover"
            />
          )}
        />
        <SwatchPicker
          legend="Color"
          options={BOT_AVATAR_COLORS}
          selectedId={selectedColorId(avatarStyle.hue)}
          onSelect={color => onPick('hue', color.hue)}
          renderSwatch={color => <ColorDot color={bodyColor(color.hue, COLOR_SWATCH_TONE)} />}
        />
        <SwatchPicker
          legend="Tone"
          options={BOT_AVATAR_TONES}
          selectedId={avatarStyle.tone}
          onSelect={option => onPick('tone', option.id)}
          renderSwatch={option => <ColorDot color={bodyColor(hue, option.id)} />}
        />
        <SwatchPicker
          legend="Mood"
          options={BOT_AVATAR_MOODS}
          selectedId={avatarStyle.mood}
          onSelect={mood => onPick('mood', mood.id)}
          renderSwatch={mood => (
            <BotAvatar
              seed={seed}
              avatarStyle={{ ...avatarStyle, mood: mood.id }}
              size={MOOD_SWATCH_SIZE}
              animate="hover"
            />
          )}
        />
      </div>
    </div>
  )
}

function SwatchPicker({ legend, options, selectedId, onSelect, renderSwatch }) {
  const name = useId()

  return (
    <fieldset className="avatar-studio__picker">
      <legend className="avatar-studio__legend">{legend}</legend>
      <div className="avatar-studio__swatches">
        {options.map(option => (
          <label
            key={option.id}
            className={`avatar-studio__swatch${option.id === selectedId ? ' avatar-studio__swatch--selected' : ''}`}
            title={option.label}
          >
            <input
              type="radio"
              className="avatar-studio__radio"
              name={name}
              value={option.id}
              aria-label={option.label}
              checked={option.id === selectedId}
              onChange={() => onSelect(option)}
            />
            {renderSwatch(option)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ColorDot({ color }) {
  return <span className="avatar-studio__dot" style={{ backgroundColor: color }} />
}
