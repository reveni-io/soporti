import { useState } from 'react'
import {
  BOT_AVATAR_COLORS,
  BOT_AVATAR_SHAPES,
  DEFAULT_BOT_AVATAR_MOOD,
  DEFAULT_PROFILE,
} from '../../../../constants.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import { createBot, deleteBot, updateBot } from '../../../../services/services.js'

const AVATAR_SEED_BYTES = 16
const HEX_RADIX = 16
const HEX_BYTE_LENGTH = 2
const SHUFFLE_TONE_IDS = ['pastel', 'mid', 'deep', 'bright']

function newAvatarSeed() {
  const bytes = crypto.getRandomValues(new Uint8Array(AVATAR_SEED_BYTES))

  return Array.from(bytes, byte => byte.toString(HEX_RADIX).padStart(HEX_BYTE_LENGTH, '0')).join('')
}

function pickAtRandom(options) {
  return options[Math.floor(Math.random() * options.length)]
}

function randomAvatarStyle(mood) {
  return {
    shape: pickAtRandom(BOT_AVATAR_SHAPES).id,
    hue: pickAtRandom(BOT_AVATAR_COLORS).hue,
    tone: pickAtRandom(SHUFFLE_TONE_IDS),
    mood,
  }
}

function initialAvatarStyle(bot) {
  if (!bot) return randomAvatarStyle(DEFAULT_BOT_AVATAR_MOOD)

  return bot.avatarStyle ?? {}
}

export function useBotForm({ bot, token, onLogout, onCreated, onUpdated, onDeleted }) {
  const [name, setName] = useState(bot?.name ?? '')
  const [description, setDescription] = useState(bot?.description ?? '')
  const [profile, setProfile] = useState(bot?.profile ?? DEFAULT_PROFILE)
  const [avatarSeed, setAvatarSeed] = useState(() => bot?.avatarSeed ?? newAvatarSeed())
  const [avatarStyle, setAvatarStyle] = useState(() => initialAvatarStyle(bot))
  const submission = useSaveField(onLogout)
  const removal = useSaveField(onLogout)

  const isEditing = Boolean(bot)
  const canSave = name.trim().length > 0 && description.trim().length > 0 && !submission.saving

  function shuffleAvatar() {
    setAvatarSeed(newAvatarSeed())
    setAvatarStyle(current => randomAvatarStyle(current.mood ?? DEFAULT_BOT_AVATAR_MOOD))
  }

  function pickAvatarTrait(trait, value) {
    setAvatarStyle(current => ({ ...current, [trait]: value }))
  }

  function persist(fields) {
    if (!bot) return createBot(token, fields)

    return updateBot(token, bot.id, fields)
  }

  async function submit() {
    if (!canSave) return

    const fields = { name: name.trim(), description: description.trim(), profile, avatarSeed, avatarStyle }
    const notify = isEditing ? onUpdated : onCreated

    await submission.save(async () => {
      const data = await persist(fields)
      await notify(data.bot)
    })
  }

  async function remove() {
    await removal.save(async () => {
      await deleteBot(token, bot.id)
      await onDeleted(bot)
    })
  }

  return {
    isEditing,
    name,
    description,
    profile,
    avatarSeed,
    avatarStyle,
    setName,
    setDescription,
    setProfile,
    shuffleAvatar,
    pickAvatarTrait,
    canSave,
    isSaving: submission.saving,
    saveError: submission.error,
    isDeleting: removal.saving,
    deleteError: removal.error,
    submit,
    remove,
  }
}
