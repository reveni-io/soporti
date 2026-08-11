import { useEffect, useState } from 'react'
import { uploadAttachment } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
} from '../../../../constants.js'

function mimeTypeFor(name) {
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase()
  return ATTACHMENT_MIME_TYPES[extension] ?? ''
}

export function useAttachments(token, onAuthError, conversationKey) {
  const [attachments, setAttachments] = useState([])
  const { saving: isUploading, error, save, clearError } = useSaveField(onAuthError)

  useEffect(() => {
    setAttachments([])
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

      const unsupported = selected.find(file => !mimeTypeFor(file.name))
      if (unsupported) throw new Error(`"${unsupported.name}" is not supported. Attach a ${ATTACHMENT_ACCEPT} file.`)

      for (const file of selected) {
        const data = await uploadAttachment(token, file, mimeTypeFor(file.name))
        setAttachments(prev => [...prev, data.attachment])
      }
    })
  }

  function removeAttachment(index) {
    clearError()
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  function clearAttachments() {
    clearError()
    setAttachments([])
  }

  return { attachments, error, isUploading, addFiles, removeAttachment, clearAttachments }
}
