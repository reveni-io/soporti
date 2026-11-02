import { VIDEO_STAGE_PRODUCTION } from '../constants.js'

function deriveStatus(stage, latest) {
  if (stage !== VIDEO_STAGE_PRODUCTION || !latest) return stage

  return latest.status
}

function toFrameView(frame) {
  return { id: frame.id, times: frame.times, createdAt: frame.createdAt }
}

function toVersionView(version, frames) {
  return {
    version: version.version,
    kind: version.kind,
    status: version.status,
    phase: version.phase,
    progress: version.progress,
    step: version.step,
    etaSeconds: version.etaSeconds,
    events: version.events,
    frames: frames.map(toFrameView),
    request: version.request,
    basedOn: version.basedOn,
    error: version.error,
    previewReady: version.previewReady,
    hasVideo: version.hasVideo,
    hasThumbnail: version.hasThumbnail,
    durationMs: version.durationMs,
    sizeBytes: version.sizeBytes,
    createdAt: version.createdAt,
    startedAt: version.startedAt,
    finishedAt: version.finishedAt,
  }
}

function groupFrames(frames) {
  const byVersion = new Map()
  for (const frame of frames) {
    byVersion.set(frame.versionId, [...(byVersion.get(frame.versionId) ?? []), frame])
  }

  return byVersion
}

export function toVideoSummary(video, versions = []) {
  const [latest] = versions

  return {
    id: video.id,
    title: video.title,
    status: deriveStatus(video.stage, latest),
    phase: latest?.phase ?? null,
    progress: latest?.progress ?? null,
    format: video.brief.format,
    durationSeconds: video.brief.durationSeconds,
    latestVersion: latest?.version ?? null,
    thumbnailVersion: versions.find(version => version.hasThumbnail)?.version ?? null,
    updatedAt: video.updatedAt,
  }
}

export function toVideoDetail(video, { versions = [], frames = [], queuePosition = null } = {}) {
  const framesByVersion = groupFrames(frames)

  return {
    id: video.id,
    title: video.title,
    status: deriveStatus(video.stage, versions[0]),
    stage: video.stage,
    brief: video.brief,
    storyboard: video.storyboard,
    storyboardError: video.storyboardError,
    parentVideoId: video.parentVideoId,
    messages: video.messages,
    versions: versions.map(version => toVersionView(version, framesByVersion.get(version.id) ?? [])),
    queuePosition,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  }
}
