import { Agent, MaxTurnsExceededError } from '@openai/agents'
import { resolveModelForAgent } from '../llm/model.js'
import {
  describeDatabaseTableTool,
  listDatabaseSchemasTool,
  listDatabaseTablesTool,
  queryDatabaseTool,
} from '../agent/tools.js'
import { traceAgentRun, trackAgentRun } from '../agent/run-tracking.js'
import { runStreamed } from '../agent/run-streamed.js'
import { ANALYTICS_INSTRUCTIONS, buildChartPrompt } from './prompt.js'
import { buildSubmitChartTool, describeToolStep } from './tools.js'
import { shortenText } from './text.js'
import { AGENT_CHANNEL_ANALYTICS, TOOL_NOT_FOUND_BEHAVIOR } from '../constants.js'

const AGENT_NAME = 'Analytics chart'
const MAX_TURNS = 30
const MAX_EXPLANATION_LENGTH = 300
const SUBMITTED_OUTPUT = 'The chart is submitted.'
const NO_CHART_ERROR = 'The analytics agent finished without submitting a chart.'
const TURN_LIMIT_ERROR =
  'The assistant ran out of steps before it could build the chart. Try again or ask for something simpler.'

export class ChartGenerationError extends Error {}

function stopOnceSettled(ctx) {
  return () => {
    if (!ctx.state.settled) return { isFinalOutput: false, isInterrupted: undefined }

    return { isFinalOutput: true, isInterrupted: undefined, finalOutput: SUBMITTED_OUTPUT }
  }
}

async function buildChartAgent(ctx) {
  const { model, modelSettings } = await resolveModelForAgent()
  const agent = new Agent({
    name: AGENT_NAME,
    model,
    instructions: ANALYTICS_INSTRUCTIONS,
    tools: [
      listDatabaseSchemasTool,
      listDatabaseTablesTool,
      describeDatabaseTableTool,
      queryDatabaseTool,
      buildSubmitChartTool(ctx),
    ],
    modelSettings,
    toolUseBehavior: stopOnceSettled(ctx),
  })
  agent.on('agent_tool_start', (_context, startedTool, { toolCall }) => {
    ctx.onStep(describeToolStep(startedTool.name, toolCall?.arguments))
  })

  return agent
}

function runChartAgent(agent, ctx) {
  const { card, userId, signal } = ctx

  return trackAgentRun(
    {
      channel: AGENT_CHANNEL_ANALYTICS,
      subject: card.id,
      userId,
      failureReason: () => (ctx.state.submission ? null : NO_CHART_ERROR),
    },
    async () => {
      const result = await traceAgentRun({ sessionId: card.id, userId, question: card.prompt }, () => {
        return runStreamed(agent, buildChartPrompt(card), {
          maxTurns: MAX_TURNS,
          signal,
          toolNotFoundBehavior: TOOL_NOT_FOUND_BEHAVIOR,
        })
      })
      if (typeof result.finalOutput === 'string') ctx.state.reply = result.finalOutput

      return result
    }
  )
}

function toGenerationError(error, ctx) {
  const explanation = shortenText(ctx.state.reply, MAX_EXPLANATION_LENGTH)
  if (explanation) return new ChartGenerationError(explanation)
  if (error instanceof MaxTurnsExceededError) return new ChartGenerationError(TURN_LIMIT_ERROR)

  return error
}

export async function generateChart(card, { userId, signal, onStep }) {
  const ctx = { card, userId, signal, onStep, state: { submission: null, settled: false, reply: '' } }
  const agent = await buildChartAgent(ctx)

  try {
    await runChartAgent(agent, ctx)
  } catch (error) {
    if (signal.aborted || !ctx.state.submission) throw toGenerationError(error, ctx)

    console.error('[analytics] The chart agent stopped after it had submitted a chart:', card.id, error)
  }

  return ctx.state.submission
}
