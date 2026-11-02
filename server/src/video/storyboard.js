import { z } from 'zod'
import { Agent, MaxTurnsExceededError } from '@openai/agents'
import { resolveModelForAgent } from '../llm/model.js'
import { buildRepoTools } from '../agent/tools.js'
import { buildAgentInput } from '../agent/agent-input.js'
import { traceAgentRun, trackAgentRun } from '../agent/run-tracking.js'
import { runStreamed } from '../agent/run-streamed.js'
import { failInterruptedStoryboards, failStoryboard, getVideo, saveStoryboard } from '../db/videos.js'
import { getVideoModelSelection, isVideoConfigured } from './settings.js'
import { loadBriefImages } from './brief.js'
import { STORYBOARD_INSTRUCTIONS, buildStoryboardPrompt, buildStoryboardTurnLimitMessage } from './storyboard-prompt.js'
import { AGENT_CHANNEL_VIDEO_STORYBOARD, TOOL_NOT_FOUND_BEHAVIOR } from '../constants.js'

const AGENT_NAME = 'Video storyboard'
const STORYBOARD_MAX_TURNS = 80
const WRAP_UP_TURNS = 1
const MIN_SCENE_SECONDS = 0.5
const TIME_STEPS_PER_SECOND = 10

const NO_OUTPUT_ERROR = 'The storyboard agent returned no storyboard.'
const NOT_CONFIGURED_ERROR =
  'Video generation is not configured yet. Ask an admin to set it up in /admin (Video section).'
const NO_SCENES_ERROR = 'The storyboard came back without scenes. Try again.'
const TURN_LIMIT_ERROR = 'The storyboard agent ran out of turns before proposing a storyboard. Try again.'
const GENERIC_ERROR = 'The storyboard could not be drafted. Try again.'
const INTERRUPTED_ERROR = 'The storyboard was interrupted by a restart. Try again.'

const SCENE_SCHEMA = z.object({
  start: z.number(),
  end: z.number(),
  title: z.string(),
  visual: z.string(),
  onScreenText: z.string(),
  sound: z.string(),
})

const STORYBOARD_OUTPUT_SCHEMA = z.object({
  reply: z.string(),
  storyboard: z.object({
    title: z.string(),
    summary: z.string(),
    durationSeconds: z.number(),
    scenes: z.array(SCENE_SCHEMA),
    music: z.object({ style: z.string(), bpm: z.number().int(), mood: z.string() }),
  }),
})

const activeDrafts = new Map()

class StoryboardError extends Error {}

function roundTime(seconds) {
  return Math.round(seconds * TIME_STEPS_PER_SECOND) / TIME_STEPS_PER_SECOND
}

function retimeScenes(scenes, durationSeconds) {
  const ordered = [...scenes].sort((a, b) => a.start - b.start)
  const lengths = ordered.map(scene => Math.max(scene.end - scene.start, MIN_SCENE_SECONDS))
  const scale = durationSeconds / lengths.reduce((total, length) => total + length, 0)
  let elapsed = 0

  return ordered.map((scene, index) => {
    const start = roundTime(elapsed)
    elapsed += lengths[index] * scale
    const end = index === ordered.length - 1 ? durationSeconds : roundTime(elapsed)

    return { ...scene, start, end }
  })
}

function normalizeStoryboard(storyboard, durationSeconds) {
  if (storyboard.scenes.length === 0) throw new StoryboardError(NO_SCENES_ERROR)

  return { ...storyboard, durationSeconds, scenes: retimeScenes(storyboard.scenes, durationSeconds) }
}

async function buildStoryboardAgent(brief) {
  const { model, modelSettings, finalAnswerModelSettings } = await resolveModelForAgent(await getVideoModelSelection())
  const agent = new Agent({
    name: AGENT_NAME,
    model,
    instructions: STORYBOARD_INSTRUCTIONS,
    tools: buildRepoTools(brief.repos),
    outputType: STORYBOARD_OUTPUT_SCHEMA,
    modelSettings,
  })

  return { agent, finalAnswerModelSettings }
}

async function runStoryboardAgent(video, { userId, signal }) {
  if (!(await isVideoConfigured())) throw new StoryboardError(NOT_CONFIGURED_ERROR)

  const { agent, finalAnswerModelSettings } = await buildStoryboardAgent(video.brief)
  const images = await loadBriefImages(video.brief, userId)
  const prompt = buildStoryboardPrompt(video, new Set(images.map(image => image.id)))
  const input = buildAgentInput(
    prompt,
    images.map(image => image.image)
  )

  async function wrapUp({ context, runData }) {
    try {
      const result = await runStreamed(
        agent.clone({ modelSettings: finalAnswerModelSettings }),
        [...runData.history, { role: 'user', content: buildStoryboardTurnLimitMessage(STORYBOARD_MAX_TURNS) }],
        { context, maxTurns: WRAP_UP_TURNS, signal, toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR }
      )

      return { finalOutput: result.finalOutput }
    } catch (err) {
      console.error('[videos] Failed to wrap up a storyboard at the turn limit:', video.id, err)
      return undefined
    }
  }

  const { result } = await trackAgentRun(
    {
      channel: AGENT_CHANNEL_VIDEO_STORYBOARD,
      subject: video.id,
      userId,
      failureReason: runResult => (runResult?.finalOutput ? null : NO_OUTPUT_ERROR),
    },
    () => {
      return traceAgentRun({ sessionId: video.id, userId, question: video.brief.idea }, () => {
        return runStreamed(agent, input, {
          maxTurns: STORYBOARD_MAX_TURNS,
          signal,
          toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR,
          errorHandlers: { maxTurns: wrapUp },
        })
      })
    }
  )

  return result.finalOutput
}

async function draftStoryboard(videoId, userId, signal) {
  const video = await getVideo(videoId, userId)
  if (!video) return null

  const output = await runStoryboardAgent(video, { userId, signal })
  const storyboard = normalizeStoryboard(output.storyboard, video.brief.durationSeconds)

  return { title: storyboard.title.trim() || video.title, storyboard, reply: output.reply.trim() }
}

async function attemptDraft(videoId, userId, signal) {
  try {
    return { draft: await draftStoryboard(videoId, userId, signal) }
  } catch (error) {
    return { error }
  } finally {
    activeDrafts.delete(videoId)
  }
}

function describeFailure(error) {
  if (error instanceof StoryboardError) return error.message
  if (error instanceof MaxTurnsExceededError) return TURN_LIMIT_ERROR

  return GENERIC_ERROR
}

async function recordOutcome(videoId, userId, { draft, error }) {
  if (draft) {
    await saveStoryboard(videoId, userId, draft)
    return
  }
  if (!error) return

  if (!(error instanceof StoryboardError)) {
    console.error('[videos] Failed to draft the storyboard of a video:', videoId, error)
  }
  await failStoryboard(videoId, userId, describeFailure(error))
}

async function draftInBackground(videoId, userId, controller) {
  const outcome = await attemptDraft(videoId, userId, controller.signal)
  if (controller.signal.aborted) return

  try {
    await recordOutcome(videoId, userId, outcome)
  } catch (err) {
    console.error('[videos] Failed to save the storyboard outcome of a video:', videoId, err)
  }
}

export function startStoryboardDraft(videoId, userId) {
  if (activeDrafts.has(videoId)) return

  const controller = new AbortController()
  activeDrafts.set(videoId, controller)
  draftInBackground(videoId, userId, controller)
}

export function cancelStoryboardDraft(videoId) {
  activeDrafts.get(videoId)?.abort()
}

export async function recoverInterruptedDrafts() {
  const count = await failInterruptedStoryboards(INTERRUPTED_ERROR)
  if (count > 0) console.log(`[videos] Marked ${count} storyboard draft(s) interrupted by the restart as failed.`)

  return count
}
