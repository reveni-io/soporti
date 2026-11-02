import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@openai/agents', () => ({ run: vi.fn() }))

const { run } = await import('@openai/agents')
const { runStreamed } = await import('./run-streamed.js')

const AGENT = { name: 'Video composer' }
const INPUT = [{ role: 'user', content: 'Compose the video.' }]

function streamedResult({ events = [], error = null } = {}) {
  const read = []
  const stream = new ReadableStream({
    start(controller) {
      events.forEach(event => controller.enqueue(event))
      if (error) {
        controller.error(error)
        return
      }
      controller.close()
    },
  })
  const completed = error ? Promise.reject(error) : Promise.resolve()
  completed.catch(() => {})

  return {
    read,
    result: {
      finalOutput: 'Done.',
      completed,
      toStream: () => {
        return stream.pipeThrough(
          new TransformStream({
            transform(event, controller) {
              read.push(event)
              controller.enqueue(event)
            },
          })
        )
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runStreamed', () => {
  it('runs the agent as a stream and returns the result once every event is read', async () => {
    const { result, read } = streamedResult({ events: [{ type: 'raw_model_stream_event' }, { type: 'agent_end' }] })
    run.mockResolvedValue(result)
    const { signal } = new AbortController()

    const output = await runStreamed(AGENT, INPUT, { maxTurns: 300, signal })

    expect(output.finalOutput).toBe('Done.')
    expect(read).toEqual([{ type: 'raw_model_stream_event' }, { type: 'agent_end' }])
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(AGENT, INPUT, { maxTurns: 300, signal, stream: true })
  })

  it('rejects with the error that ended the run', async () => {
    const error = new Error('Cannot connect to API: other side closed')
    run.mockResolvedValue(streamedResult({ error }).result)

    await expect(runStreamed(AGENT, INPUT, { maxTurns: 300 })).rejects.toBe(error)
  })

  it('rejects with the abort reason when the run was cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    run.mockResolvedValue(streamedResult().result)

    await expect(runStreamed(AGENT, INPUT, { signal: controller.signal })).rejects.toThrow('This operation was aborted')
  })
})
