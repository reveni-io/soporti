import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  claimNextVersion,
  completeVersion,
  failVersion,
  markPreviewReady,
  markVersionCancelled,
  materializeVersionFiles,
  requeueInterruptedVersions,
} from '../db/video-versions.js'
import { loadVideoAssets, readProjectFiles } from '../db/video-files.js'
import { bundleProject } from './bundle.js'
import { loadKit } from './kit.js'
import { renderVideo } from './render.js'
import { extractThumbnail } from './thumbnail.js'
import { composeVideo } from './agent.js'
import { notifyVersionOutcome } from './notify.js'
import { createProgressReporter, formatClock } from './progress.js'
import { VideoProjectError } from './project-error.js'
import {
  VIDEO_KIND_RENDER,
  VIDEO_PHASE_COMPOSING,
  VIDEO_PHASE_FINALIZING,
  VIDEO_PHASE_MUSIC,
  VIDEO_PHASE_PREPARING,
  VIDEO_PHASE_RENDERING,
  VIDEO_STATUS_FAILED,
  VIDEO_STATUS_READY,
} from '../constants.js'

const MAX_RUNNING_VERSIONS = 1
const POLL_INTERVAL_MS = 15_000
const THUMBNAIL_POSITION = 0.35
const WORK_ROOT = join(tmpdir(), 'soporti-videos')
const GENERIC_FAILURE = 'Something went wrong while making this version. Try again.'

const RENDER_STEPS = {
  [VIDEO_PHASE_MUSIC]: () => 'Synthesizing the soundtrack',
  [VIDEO_PHASE_RENDERING]: ({ done, total }) => `Rendering frame ${done} of ${total}`,
  [VIDEO_PHASE_FINALIZING]: () => 'Mixing the sound and encoding the MP4',
}

const running = new Map()
const loop = { timer: null, draining: false, again: false, stopped: true }

function toProgressFields({ phase, done, total, etaSeconds }) {
  return {
    phase,
    progress: total > 0 ? Math.round((done / total) * 100) : null,
    etaSeconds: etaSeconds ?? null,
    step: RENDER_STEPS[phase]?.({ done, total }) ?? null,
  }
}

async function composePhases(job, { signal, reporter }) {
  reporter.update({ phase: VIDEO_PHASE_PREPARING, progress: null, step: 'Preparing the project files' })
  await materializeVersionFiles(job)
  signal.throwIfAborted()

  reporter.update({ phase: VIDEO_PHASE_COMPOSING, step: 'Reading the brief and the storyboard' })
  const { summary } = await composeVideo(job, { signal, reporter })
  signal.throwIfAborted()

  await markPreviewReady(job, summary)
}

async function bundleForRender(job) {
  const [files, assets] = await Promise.all([readProjectFiles(job.id), loadVideoAssets(job.videoId)])
  return bundleProject({ files, assets, kit: loadKit(), mode: 'render' }).html
}

async function renderPhases(job, { signal, reporter }) {
  reporter.update({ phase: VIDEO_PHASE_MUSIC, progress: 0, step: RENDER_STEPS[VIDEO_PHASE_MUSIC]() })
  const html = await bundleForRender(job)
  const workDir = join(WORK_ROOT, `${job.id}-${Date.now()}`)

  try {
    const video = await renderVideo({
      html,
      workDir,
      signal,
      onProgress: event => reporter.update(toProgressFields(event)),
    })
    const thumbnail = await extractThumbnail({
      mp4Path: video.mp4Path,
      atSeconds: (video.durationMs / 1000) * THUMBNAIL_POSITION,
    })
    const mp4 = await readFile(video.mp4Path)

    return { mp4, thumbnail, durationMs: video.durationMs, sizeBytes: video.sizeBytes }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

async function runPhases(job, context) {
  const rendersOnly = job.kind === VIDEO_KIND_RENDER || job.previewReady
  if (!rendersOnly) await composePhases(job, context)

  return renderPhases(job, context)
}

async function recordSuccess(job, media) {
  const message = `Version ${job.version} is ready (${formatClock(media.durationMs / 1000)}).`
  if (!(await completeVersion(job, { ...media, message }))) return

  await notifyVersionOutcome({ job, status: VIDEO_STATUS_READY, durationMs: media.durationMs })
}

function describeFailure(job, error) {
  if (error instanceof VideoProjectError) return error.message

  console.error('[videos] Failed to make a video version:', job.id, error)
  return GENERIC_FAILURE
}

async function recordFailure(job, error, signal) {
  if (signal.aborted) {
    await markVersionCancelled(job.id)
    return
  }

  const reason = describeFailure(job, error)
  if (!(await failVersion(job, { error: reason, message: `Version ${job.version} failed: ${reason}` }))) return

  await notifyVersionOutcome({ job, status: VIDEO_STATUS_FAILED, error: reason })
}

async function processVersion(job, controller) {
  const { signal } = controller
  const reporter = createProgressReporter(job, { onCancelRequested: () => controller.abort() })

  try {
    const media = await runPhases(job, { signal, reporter })
    await reporter.close()
    signal.throwIfAborted()
    await recordSuccess(job, media)
  } catch (error) {
    await reporter.close()
    await recordFailure(job, error, signal)
  }
}

function launch(job) {
  const controller = new AbortController()
  running.set(job.id, controller)

  processVersion(job, controller)
    .catch(err => console.error('[videos] Failed to record the outcome of a video version:', job.id, err))
    .finally(() => {
      running.delete(job.id)
      wakeVideoRunner()
    })
}

async function claimWhileFree() {
  while (!loop.stopped && running.size < MAX_RUNNING_VERSIONS) {
    const job = await claimNextVersion()
    if (!job) return

    launch(job)
  }
}

async function drain() {
  if (loop.draining) {
    loop.again = true
    return
  }

  loop.draining = true
  try {
    do {
      loop.again = false
      await claimWhileFree()
    } while (loop.again)
  } finally {
    loop.draining = false
  }
}

export function wakeVideoRunner() {
  if (loop.stopped) return

  drain().catch(err => console.error('[videos] Failed to claim a queued video version:', err))
}

export async function startVideoRunner() {
  await rm(WORK_ROOT, { recursive: true, force: true })
  const requeued = await requeueInterruptedVersions()
  if (requeued > 0) console.log(`[videos] Re-queued ${requeued} video version(s) interrupted by the restart.`)

  loop.stopped = false
  loop.timer = setInterval(wakeVideoRunner, POLL_INTERVAL_MS)
  loop.timer.unref()
  wakeVideoRunner()
}

export function stopVideoRunner() {
  loop.stopped = true
  clearInterval(loop.timer)
  loop.timer = null
}

export function cancelVideoVersion(versionId) {
  running.get(versionId)?.abort()
}
