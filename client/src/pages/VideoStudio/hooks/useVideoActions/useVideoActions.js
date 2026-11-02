import { useState } from 'react'
import {
  absoluteApiUrl,
  cancelVideo,
  createVideoVariant,
  deleteVideo,
  generateVideo,
  redraftStoryboard,
  renderVideoVersion,
  retryVideoVersion,
  sendVideoMessage,
  shareVideoVersion,
} from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

export function useVideoActions({ token, id, onLogout, onVideo, onVariant }) {
  const { saving: busy, error, save } = useSaveField(onLogout)
  const [shareUrl, setShareUrl] = useState(null)

  function run(request) {
    return save(async () => {
      const { video } = await request()
      onVideo(video)
    })
  }

  function share(version) {
    return save(async () => {
      const { url } = await shareVideoVersion(token, id, version)
      setShareUrl(absoluteApiUrl(url))
    })
  }

  function createVariant(change) {
    return save(async () => {
      const { video } = await createVideoVariant(token, id, change)
      onVariant(video)
    })
  }

  return {
    busy,
    error,
    shareUrl,
    sendMessage: text => run(() => sendVideoMessage(token, id, text)),
    redraft: () => run(() => redraftStoryboard(token, id)),
    generate: () => run(() => generateVideo(token, id)),
    cancel: () => run(() => cancelVideo(token, id)),
    retry: version => run(() => retryVideoVersion(token, id, version)),
    render: version => run(() => renderVideoVersion(token, id, version)),
    share,
    closeShare: () => setShareUrl(null),
    createVariant,
    remove: () => save(() => deleteVideo(token, id)),
  }
}
