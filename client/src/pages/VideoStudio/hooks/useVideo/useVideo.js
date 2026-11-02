import { useCallback } from 'react'
import { getVideo } from '../../../../services/services.js'
import { usePolledResource } from '../../../../hooks/usePolledResource/usePolledResource.js'
import { ACTIVE_VIDEO_STATUSES } from '../../../../constants.js'

const POLL_INTERVAL_MS = 2000

function isInProgress(data) {
  return ACTIVE_VIDEO_STATUSES.includes(data.video.status)
}

export function useVideo(token, id, onLogout) {
  const fetchVideo = useCallback(currentToken => getVideo(currentToken, id), [id])
  const { data, setData, loading, error } = usePolledResource(fetchVideo, {
    token,
    intervalMs: POLL_INTERVAL_MS,
    shouldPoll: isInProgress,
    onLogout,
  })

  function replaceVideo(video) {
    setData({ video })
  }

  return { video: data?.video ?? null, loading, error, replaceVideo }
}
