import config from '../config.js'
import { findUserById } from '../db/users.js'
import { isSlackConfigured } from '../slack/settings.js'
import { postDirectMessage } from '../slack/client.js'
import { formatClock } from './progress.js'
import { VIDEO_STATUS_READY } from '../constants.js'

function videoUrl(videoId) {
  return `${config.publicUrl}/videos/${videoId}`
}

function buildOutcomeMessage({ job, status, durationMs, error }) {
  const { title } = job.video
  const link = videoUrl(job.videoId)

  if (status === VIDEO_STATUS_READY) {
    return `Your video *${title}* is ready: version ${job.version}, ${formatClock(durationMs / 1000)}.\n${link}`
  }
  return `Version ${job.version} of your video *${title}* failed: ${error}\n${link}`
}

export async function notifyVersionOutcome(outcome) {
  const { job } = outcome

  try {
    if (!(await isSlackConfigured())) {
      console.log(`[videos] Slack is not configured: no DM for version ${job.version} of video ${job.videoId}.`)
      return false
    }

    const user = await findUserById(job.video.userId)
    if (!user?.slackId && !user?.email) {
      console.log(`[videos] User ${job.video.userId} has no Slack id or email: no DM for video ${job.videoId}.`)
      return false
    }

    await postDirectMessage({ slackId: user.slackId, email: user.email }, buildOutcomeMessage(outcome))
    return true
  } catch (err) {
    console.log(`[videos] Could not DM the owner of video ${job.videoId} on Slack: ${err.message}`)
    return false
  }
}
