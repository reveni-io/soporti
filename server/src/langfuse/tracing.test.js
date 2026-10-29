import { describe, it, expect, vi, beforeEach } from 'vitest'

const setTraceProcessors = vi.fn()
vi.mock('@openai/agents', async importOriginal => ({ ...(await importOriginal()), setTraceProcessors }))

const exportSpans = vi.fn().mockResolvedValue(undefined)
vi.mock('./client.js', () => ({ exportSpans }))

const { Span } = await import('@openai/agents')
const { registerLangfuseTracing } = await import('./tracing.js')

function registeredProcessor() {
  return setTraceProcessors.mock.calls[0][0][0]
}

function endSpan(processor, index) {
  const span = new Span({ traceId: 'trace_1', data: { type: 'agent', name: `Soporti ${index}` } }, processor)
  span.start()
  span.end()

  return span
}

beforeEach(() => {
  registerLangfuseTracing()
})

describe('registerLangfuseTracing', () => {
  it('replaces every trace processor with one that hands finished spans to the Langfuse exporter', async () => {
    expect(setTraceProcessors).toHaveBeenCalledTimes(1)
    expect(setTraceProcessors.mock.calls[0][0]).toHaveLength(1)

    const processor = registeredProcessor()
    const span = endSpan(processor, 0)
    await processor.forceFlush()

    expect(exportSpans).toHaveBeenCalledTimes(1)
    expect(exportSpans.mock.calls[0][0]).toEqual([span])
  })
})
