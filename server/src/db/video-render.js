export function toVideoSummary(video) {
  return {
    id: video.id,
    title: video.title,
    status: video.stage,
    phase: null,
    progress: null,
    format: video.brief.format,
    durationSeconds: video.brief.durationSeconds,
    latestVersion: null,
    thumbnailVersion: null,
    updatedAt: video.updatedAt,
  }
}

export function toVideoDetail(video) {
  return {
    id: video.id,
    title: video.title,
    status: video.stage,
    stage: video.stage,
    brief: video.brief,
    storyboard: video.storyboard,
    storyboardError: video.storyboardError,
    parentVideoId: video.parentVideoId,
    messages: video.messages,
    versions: [],
    queuePosition: null,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  }
}
