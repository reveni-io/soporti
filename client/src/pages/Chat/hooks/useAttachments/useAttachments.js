import { useEffect, useState } from 'react'
import { uploadAttachment } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
} from '../../../../constants.js'

const PASTED_IMAGE_NAME = 'pasted-image'

const EXTENSION_FOR_IMAGE_MIME_TYPE = Object.fromEntries(
  Object.entries(IMAGE_MIME_TYPES).map(([extension, mimeType]) => [mimeType, extension])
)

function resolveUpload(file) {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  const byExtension = ATTACHMENT_MIME_TYPES[extension]
  if (byExtension) return { name: file.name, mimeType: byExtension }

  const imageExtension = EXTENSION_FOR_IMAGE_MIME_TYPE[file.type]
  if (!imageExtension) return null

  const base = file.name.replace(/\.[^.]*$/, '') || PASTED_IMAGE_NAME
  return { name: `${base}${imageExtension}`, mimeType: file.type }
}

function revokePreview(attachment) {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
}

export function useAttachments(token, onAuthError, conversationKey) {
  const [attachments, setAttachments] = useState([])
  const { saving: isUploading, error, save, clearError } = useSaveField(onAuthError)

  useEffect(() => {
    setAttachments(previous => {
      previous.forEach(revokePreview)
      return []
    })
    clearError()
  }, [conversationKey, clearError])

  async function addFiles(files) {
    const selected = [...files]
    if (selected.length === 0) return

    await save(async () => {
      if (attachments.length + selected.length > MAX_ATTACHMENTS) {
        throw new Error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`)
      }

      const oversized = selected.find(file => file.size > MAX_ATTACHMENT_BYTES)
      if (oversized) throw new Error(`"${oversized.name}" is too large (max ${MAX_ATTACHMENT_MB} MB).`)

      const unsupported = selected.find(file => !resolveUpload(file))
      if (unsupported) throw new Error(`"${unsupported.name}" is not supported. Attach a ${ATTACHMENT_ACCEPT} file.`)

      for (const file of selected) {
        const { name, mimeType } = resolveUpload(file)
        const data = await uploadAttachment(token, file, mimeType, name)
        const previewUrl = data.attachment.imageId ? URL.createObjectURL(file) : undefined

        setAttachments(previous => [...previous, { ...data.attachment, previewUrl }])
      }
    })
  }

  function removeAttachment(index) {
    clearError()
    setAttachments(previous => {
      previous.filter((_, i) => i === index).forEach(revokePreview)
      return previous.filter((_, i) => i !== index)
    })
  }

  function clearAttachments() {
    clearError()
    setAttachments(previous => {
      previous.forEach(revokePreview)
      return []
    })
  }

  return { attachments, error, isUploading, addFiles, removeAttachment, clearAttachments }
}
