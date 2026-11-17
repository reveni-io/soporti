import { Agent, run } from '@openai/agents'
import { resolveModelForAgent } from '../llm/model.js'
import { BOT_GREETING_TURN, buildBotGreetingPrompt } from '../agent/system-prompt.js'

const GREETING_TURNS = 1

function fallbackGreeting(name) {
  return `Hi! I'm ${name}. Tell me what you need and I'll get on it.`
}

async function writeGreeting(bot) {
  const { model, modelSettings } = await resolveModelForAgent()
  const agent = new Agent({ name: bot.name, model, instructions: buildBotGreetingPrompt(bot), modelSettings })
  const result = await run(agent, BOT_GREETING_TURN, { maxTurns: GREETING_TURNS })

  return typeof result.finalOutput === 'string' ? result.finalOutput.trim() : ''
}

export async function generateGreeting(bot) {
  try {
    const greeting = await writeGreeting(bot)
    if (greeting) return greeting

    console.error(`[bots] The greeting of bot ${bot.id} came back empty.`)
  } catch (err) {
    console.error(`[bots] Failed to write the greeting of bot ${bot.id}:`, err)
  }

  return fallbackGreeting(bot.name)
}
