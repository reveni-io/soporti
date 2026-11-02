import { useState } from 'react'
import { uploadAttachment } from '../../../../../services/services.js'
import { useSaveField } from '../../../../../hooks/useSaveField/useSaveField.js'
import {
  ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  VIDEO_MAX_ATTACHMENTS,
} from '../../../../../constants.js'

const SUPPORTED_FILES = 'a PDF, Word, Excel or CSV file, or an image'

function mimeTypeOf(file) {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()

  return ATTACHMENT_MIME_TYPES[extension] ?? null
}

function findProblem(files, attachedCount) {
  if (attachedCount + files.length > VIDEO_MAX_ATTACHMENTS) {
    return `You can attach up to ${VIDEO_MAX_ATTACHMENTS} files.`
  }

  const oversized = files.find(file => file.size > MAX_ATTACHMENT_BYTES)
  if (oversized) return `"${oversized.name}" is too large (max ${MAX_ATTACHMENT_MB} MB).`

  const unsupported = files.find(file => !mimeTypeOf(file))
  if (unsupported) return `"${unsupported.name}" is not supported. Attach ${SUPPORTED_FILES}.`

  return null
}

export function useBriefAttachments(token, onLogout) {
  const [attachments, setAttachments] = useState([])
  const { saving: isUploading, error, save, clearError } = useSaveField(onLogout)

  async function addFiles(fileList) {
    const files = [...fileList]
    if (files.length === 0) return

    await save(async () => {
      const problem = findProblem(files, attachments.length)
      if (problem) throw new Error(problem)

      for (const file of files) {
        const { attachment } = await uploadAttachment(token, file, mimeTypeOf(file), file.name)
        setAttachments(previous => [...previous, attachment])
      }
    })
  }

  function removeAttachment(index) {
    clearError()
    setAttachments(previous => previous.filter((_, position) => position !== index))
  }

  return { attachments, isUploading, error, addFiles, removeAttachment }
}
