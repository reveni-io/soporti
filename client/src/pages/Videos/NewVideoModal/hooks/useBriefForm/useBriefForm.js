import { useState } from 'react'
import { createVideo } from '../../../../../services/services.js'
import { useSaveField } from '../../../../../hooks/useSaveField/useSaveField.js'
import { DEFAULT_BRIEF } from '../../brief-options.js'

const NO_ERRORS = {}

function validateBrief(fields) {
  const errors = {}
  if (!fields.idea.trim()) errors.idea = 'Describe what the video should tell.'
  if (fields.repos.length === 0) errors.repos = 'Pick at least one repo.'

  return errors
}

function toBriefAttachment({ name, text, imageId }) {
  return imageId ? { name, imageId } : { name, text }
}

function buildBrief(fields, attachments) {
  return {
    idea: fields.idea.trim(),
    repos: fields.repos,
    path: fields.path.trim() || null,
    audience: fields.audience,
    language: fields.language,
    format: fields.format,
    durationSeconds: fields.durationSeconds,
    pace: fields.pace,
    attachments: attachments.map(toBriefAttachment),
  }
}

function toggle(list, item) {
  return list.includes(item) ? list.filter(entry => entry !== item) : [...list, item]
}

export function useBriefForm({ token, onLogout, onCreated }) {
  const [fields, setFields] = useState(DEFAULT_BRIEF)
  const [isAttempted, setIsAttempted] = useState(false)
  const { saving: submitting, error, save } = useSaveField(onLogout)

  const errors = isAttempted ? validateBrief(fields) : NO_ERRORS

  function setField(name, value) {
    setFields(previous => ({ ...previous, [name]: value }))
  }

  function toggleRepo(fullName) {
    setFields(previous => ({ ...previous, repos: toggle(previous.repos, fullName) }))
  }

  async function submit(attachments) {
    setIsAttempted(true)
    if (Object.keys(validateBrief(fields)).length > 0) return

    await save(async () => {
      const { video } = await createVideo(token, buildBrief(fields, attachments))
      onCreated(video)
    })
  }

  return { fields, errors, submitting, error, setField, toggleRepo, submit }
}
