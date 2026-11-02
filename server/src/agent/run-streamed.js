import { run } from '@openai/agents'

export async function runStreamed(agent, input, options) {
  const result = await run(agent, input, { ...options, stream: true })

  await result.toStream().pipeTo(new WritableStream())
  await result.completed
  options.signal?.throwIfAborted()

  return result
}
