import { listVideos } from '../../services/services.js'
import { usePolledResource } from '../usePolledResource/usePolledResource.js'
import { ACTIVE_VIDEO_STATUSES, GENERATING_VIDEO_STATUSES } from '../../constants.js'

const POLL_INTERVAL_MS = 5000
const NO_VIDEOS = []

function hasActiveVideo(data) {
  return data.videos.some(video => ACTIVE_VIDEO_STATUSES.includes(video.status))
}

function isGenerating(video) {
  return GENERATING_VIDEO_STATUSES.includes(video.status)
}

export function useVideos(token, onLogout) {
  const { data, loading, error } = usePolledResource(listVideos, {
    token,
    intervalMs: POLL_INTERVAL_MS,
    shouldPoll: hasActiveVideo,
    onLogout,
  })

  const videos = data?.videos ?? NO_VIDEOS

  return { videos, loading, error, isGenerating: videos.some(isGenerating) }
}
