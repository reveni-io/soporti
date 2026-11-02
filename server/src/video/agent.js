import { Agent, MaxTurnsExceededError } from '@openai/agents'
import config from '../config.js'
import { resolveModelForAgent } from '../llm/model.js'
import { buildAgentInput } from '../agent/agent-input.js'
import { traceAgentRun, trackAgentRun } from '../agent/run-tracking.js'
import { runStreamed } from '../agent/run-streamed.js'
import { listProjectFiles } from '../db/video-files.js'
import { getVersionSummary } from '../db/video-versions.js'
import { getVideoModelSelection, isVideoConfigured } from './settings.js'
import { loadBriefImages } from './brief.js'
import { buildCompositionPrompt, buildCompositionTurnLimitMessage, VIDEO_INSTRUCTIONS } from './prompt.js'
import { buildVideoTools, describeToolStep, runVideoCheck } from './tools.js'
import { VideoProjectError } from './project-error.js'
import { AGENT_CHANNEL_VIDEO, TOOL_NOT_FOUND_BEHAVIOR } from '../constants.js'

const AGENT_NAME = 'Video composer'
const WRAP_UP_TURNS = 1

const NOT_CONFIGURED_ERROR =
  'Video generation is not configured yet. Ask an admin to set it up in /admin (Video section).'
const TURN_LIMIT_ERROR = 'The video agent ran out of turns before the video passed its checks.'
const DEFAULT_SUMMARY = 'The video is composed.'

function describeCheckFailure(check) {
  if (!check || check.ok) return null

  const [first, ...rest] = check.errors
  const more = rest.length > 0 ? ` (and ${rest.length} more problem${rest.length === 1 ? '' : 's'})` : ''
  return `The video did not pass its last check: ${first}${more}`
}

async function loadPromptContext(job) {
  const { video } = job
  const [images, files, previousSummary] = await Promise.all([
    loadBriefImages(video.brief, video.userId),
    listProjectFiles(job.id),
    job.basedOn === null ? null : getVersionSummary(job.videoId, job.basedOn),
  ])

  return { images, hasFiles: files.length > 0, previousSummary }
}

async function buildInput(job) {
  const { images, hasFiles, previousSummary } = await loadPromptContext(job)
  const prompt = buildCompositionPrompt({
    video: job.video,
    version: job,
    previousSummary,
    availableImageIds: new Set(images.map(image => image.id)),
    hasFiles,
  })

  return buildAgentInput(
    prompt,
    images.map(image => image.image)
  )
}

async function buildComposer(ctx) {
  const { model, modelSettings, finalAnswerModelSettings } = await resolveModelForAgent(await getVideoModelSelection())
  const agent = new Agent({
    name: AGENT_NAME,
    model,
    instructions: VIDEO_INSTRUCTIONS,
    tools: buildVideoTools(ctx),
    modelSettings,
  })
  agent.on('agent_tool_start', (_context, tool, { toolCall }) => {
    ctx.reporter.step(describeToolStep(tool.name, toolCall?.arguments))
  })

  return { agent, finalAnswerModelSettings }
}

function wrapUpHandler({ agent, finalAnswerModelSettings, ctx }) {
  return async ({ context, runData }) => {
    try {
      const result = await runStreamed(
        agent.clone({ modelSettings: finalAnswerModelSettings }),
        [...runData.history, { role: 'user', content: buildCompositionTurnLimitMessage(config.video.maxTurns) }],
        { context, maxTurns: WRAP_UP_TURNS, signal: ctx.signal, toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR }
      )

      return { finalOutput: result.finalOutput }
    } catch (err) {
      console.error('[videos] Failed to wrap up a composition at the turn limit:', ctx.job.id, err)
      return undefined
    }
  }
}

function runComposer({ agent, finalAnswerModelSettings, input, ctx }) {
  const { job, signal } = ctx
  const { userId, brief } = job.video

  return trackAgentRun(
    {
      channel: AGENT_CHANNEL_VIDEO,
      subject: job.videoId,
      userId,
      failureReason: () => describeCheckFailure(ctx.state.lastCheck),
    },
    async () => {
      const result = await traceAgentRun({ sessionId: job.videoId, userId, question: brief.idea }, () => {
        return runStreamed(agent, input, {
          maxTurns: config.video.maxTurns,
          signal,
          toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR,
          errorHandlers: { maxTurns: wrapUpHandler({ agent, finalAnswerModelSettings, ctx }) },
        })
      })
      if (!ctx.state.lastCheck) await runVideoCheck(ctx)

      return result
    }
  )
}

function toCompositionError(error, ctx) {
  const checkFailure = describeCheckFailure(ctx.state.lastCheck)
  if (checkFailure) return new VideoProjectError(checkFailure)
  if (error instanceof MaxTurnsExceededError) return new VideoProjectError(TURN_LIMIT_ERROR)

  return error
}

export async function composeVideo(job, { signal, reporter }) {
  if (!(await isVideoConfigured())) throw new VideoProjectError(NOT_CONFIGURED_ERROR)

  const ctx = { job, reporter, signal, state: { lastCheck: null, revision: 0 } }
  const { agent, finalAnswerModelSettings } = await buildComposer(ctx)
  const input = await buildInput(job)

  try {
    const { result } = await runComposer({ agent, finalAnswerModelSettings, input, ctx })
    const summary = typeof result.finalOutput === 'string' ? result.finalOutput.trim() : ''

    return { summary: summary || DEFAULT_SUMMARY }
  } catch (error) {
    throw toCompositionError(error, ctx)
  }
}
