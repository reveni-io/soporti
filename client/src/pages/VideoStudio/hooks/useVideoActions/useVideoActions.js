import { deleteVideo, generateVideo, redraftStoryboard, sendVideoMessage } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'

export function useVideoActions({ token, id, onLogout, onVideo }) {
  const { saving: busy, error, save } = useSaveField(onLogout)

  function run(request) {
    return save(async () => {
      const { video } = await request()
      onVideo(video)
    })
  }

  return {
    busy,
    error,
    sendMessage: text => run(() => sendVideoMessage(token, id, text)),
    redraft: () => run(() => redraftStoryboard(token, id)),
    generate: () => run(() => generateVideo(token, id)),
    remove: () => save(() => deleteVideo(token, id)),
  }
}
