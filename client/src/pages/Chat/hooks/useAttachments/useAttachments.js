import { useEffect, useRef, useState } from 'react'
import { saveAttachmentThumbnail, uploadAttachment } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import { buildThumbnail } from './thumbnail.js'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
} from '../../../../constants.js'

const PASTED_IMAGE_NAME = 'pasted-image'

const EXTENSION_FOR_IMAGE_MIME_TYPE = Object.entries(IMAGE_MIME_TYPES).reduce((byMimeType, [extension, mimeType]) => {
  if (!(mimeType in byMimeType)) byMimeType[mimeType] = extension
  return byMimeType
}, {})

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
  if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
}

function withPreviewsRevoked(previous) {
  previous.forEach(revokePreview)
  return []
}

async function storeThumbnail(token, file, imageId) {
  const thumbnail = await buildThumbnail(file)
  if (!thumbnail) return

  await saveAttachmentThumbnail(token, imageId, thumbnail).catch(() => {})
}

export function useAttachments(token, onAuthError, conversationKey) {
  const [attachments, setAttachments] = useState([])
  const { saving: isUploading, error, save, clearError } = useSaveField(onAuthError)
  const staged = useRef([])

  staged.current = attachments

  useEffect(() => {
    setAttachments(withPreviewsRevoked)
    clearError()
  }, [conversationKey, clearError])

  useEffect(() => () => staged.current.forEach(revokePreview), [])

  async function addFiles(files) {
    const selected = [...files]
    if (selected.length === 0) return

    await save(async () => {
      if (attachments.length + selected.length > MAX_ATTACHMENTS) {
        throw new Error(`You can attach up to ${MAX_ATTACHMENTS} files per message.`)
      }

      const oversized = selected.find(file => file.size > MAX_ATTACHMENT_BYTES)
      if (oversized) throw new Error(`"${oversized.name}" is too large (max ${MAX_ATTACHMENT_MB} MB).`)

      const uploads = selected.map(file => ({ file, upload: resolveUpload(file) }))

      const unsupported = uploads.find(({ upload }) => !upload)
      if (unsupported) {
        throw new Error(`"${unsupported.file.name}" is not supported. Attach a ${ATTACHMENT_ACCEPT} file.`)
      }

      const results = await Promise.allSettled(
        uploads.map(({ file, upload }) => uploadAttachment(token, file, upload.mimeType, upload.name))
      )

      const uploaded = []
      for (const [index, result] of results.entries()) {
        if (result.status !== 'fulfilled') continue

        const { attachment } = result.value
        const file = uploads[index].file
        const previewUrl = attachment.imageId ? URL.createObjectURL(file) : undefined

        uploaded.push({ ...attachment, previewUrl })
        if (attachment.imageId) storeThumbnail(token, file, attachment.imageId)
      }

      if (uploaded.length > 0) setAttachments(previous => [...previous, ...uploaded])

      const failed = results.find(result => result.status === 'rejected')
      if (failed) throw failed.reason
    })
  }

  function removeAttachment(index) {
    clearError()
    setAttachments(previous => {
      revokePreview(previous[index])
      return previous.filter((_, i) => i !== index)
    })
  }

  function clearAttachments() {
    clearError()
    setAttachments(withPreviewsRevoked)
  }

  return { attachments, error, isUploading, addFiles, removeAttachment, clearAttachments }
}
