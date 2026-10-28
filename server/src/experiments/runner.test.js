import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const run = vi.fn()
const forceFlush = vi.fn(async () => {})
let traceCounter = 0
vi.mock('@openai/agents', async importOriginal => ({
  ...(await importOriginal()),
  run,
  generateTraceId: () => `trace_${String((traceCounter += 1)).padStart(32, '0')}`,
  getGlobalTraceProvider: () => ({ forceFlush }),
}))

const createAgent = vi.fn(async (sources, profile, options) => ({ sources, profile, options }))
vi.mock('../agent/assistant.js', () => ({ createAgent }))

const trackAgentRun = vi.fn((_options, runAgent) => runAgent())
const traceAgentRun = vi.fn((_options, runAgent) => runAgent())
vi.mock('../agent/run-tracking.js', () => ({ trackAgentRun, traceAgentRun }))

const searchSimilarCases = vi.fn(async () => [])
vi.mock('../knowledge/client.js', () => ({ searchSimilarCases }))

const buildAgentInput = vi.fn(text => ({ text }))
vi.mock('../agent/agent-input.js', () => ({ buildAgentInput }))

const storedConfig = {}
vi.mock('../db/app-config.js', () => ({
  getConfigValue: vi.fn(async key => storedConfig[key] ?? null),
  setConfigValue: vi.fn(),
}))

const listDatasetItems = vi.fn()
const linkDatasetRunItem = vi.fn(async () => {})
const fetchExperimentPrompt = vi.fn()
vi.mock('../langfuse/sdk.js', async importOriginal => ({
  ...(await importOriginal()),
  createLangfuseClient: vi.fn(config => ({ host: config.host })),
  listDatasetItems,
  linkDatasetRunItem,
  fetchExperimentPrompt,
}))

const { _resetLangfuseSettingsCacheForTests } = await import('../langfuse/settings.js')
const { langfuseTraceId } = await import('../langfuse/client.js')
const { claimExperimentSlot, prepareExperiment, releaseExperimentSlot, startExperiment } = await import('./runner.js')

const CONFIGURED = {
  langfuse_public_key: 'pk-lf-1',
  langfuse_secret_key: 'sk-lf-1',
  langfuse_host: 'https://lf.example',
}
const COMPACT_CONFIG = { sections: { core_guidelines: 'Short rules.' } }

function datasetItem(id, input, status = 'ACTIVE') {
  return { id, input, status }
}

const QUESTION_ITEMS = [
  datasetItem('item-1', { question: 'Why did order 42 fail?', sources: ['yolo'] }),
  datasetItem('item-2', { question: 'Who owns refunds?', sources: ['integration:notion'], profile: 'tech' }),
]

const REQUEST = {
  dataset: 'support-questions',
  runName: 'compact ab',
  variants: [{ baseline: true }, { label: 'compact' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  traceCounter = 0
  Object.keys(storedConfig).forEach(key => delete storedConfig[key])
  Object.assign(storedConfig, CONFIGURED)
  _resetLangfuseSettingsCacheForTests()
  releaseExperimentSlot()
  listDatasetItems.mockResolvedValue({ items: QUESTION_ITEMS, hasMorePages: false })
  fetchExperimentPrompt.mockResolvedValue({ version: 5, config: COMPACT_CONFIG })
  run.mockImplementation(async agent => ({ finalOutput: `answer from ${agent.profile}` }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('prepareExperiment', () => {
  it('resolves every variant once and names each run after it with one shared timestamp', async () => {
    const prepared = await prepareExperiment(REQUEST)

    const [baseline, compact] = prepared.value.runs
    expect(baseline).toEqual(expect.objectContaining({ key: 'baseline', overrides: null, promptVersion: null }))
    expect(compact).toEqual(expect.objectContaining({ key: 'compact', promptVersion: 5 }))
    expect(baseline.runName).toMatch(/^compact ab \[baseline\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    expect(compact.runName.slice(-19)).toBe(baseline.runName.slice(-19))
    expect(fetchExperimentPrompt).toHaveBeenCalledTimes(1)
    expect(prepared.value.items.map(item => item.id)).toEqual(['item-1', 'item-2'])
  })

  it('skips archived items and items whose input is not a question with sources', async () => {
    listDatasetItems.mockResolvedValue({
      items: [
        ...QUESTION_ITEMS,
        datasetItem('item-archived', { question: 'Old?', sources: ['yolo'] }, 'ARCHIVED'),
        datasetItem('item-string', 'Why did order 42 fail?'),
        datasetItem('item-no-sources', { question: 'Why?' }),
        datasetItem('item-bad-profile', { question: 'Why?', sources: ['yolo'], profile: 'root' }),
      ],
      hasMorePages: false,
    })

    const prepared = await prepareExperiment(REQUEST)

    expect(prepared.value.items.map(item => item.id)).toEqual(['item-1', 'item-2'])
    expect(prepared.value.skipped).toEqual(['item-string', 'item-no-sources', 'item-bad-profile'])
  })

  it.each([
    { kind: 'Langfuse is not configured', setup: () => delete storedConfig.langfuse_secret_key, status: 422 },
    { kind: 'metadata-only mode is on', setup: () => (storedConfig.langfuse_metadata_only = true), status: 422 },
    {
      kind: 'the dataset does not exist',
      setup: () => listDatasetItems.mockRejectedValue(Object.assign(new Error('missing'), { statusCode: 404 })),
      status: 404,
    },
    {
      kind: 'the dataset is empty',
      setup: () => listDatasetItems.mockResolvedValue({ items: [], hasMorePages: false }),
      status: 404,
    },
    {
      kind: 'the dataset has more pages',
      setup: () => listDatasetItems.mockResolvedValue({ items: QUESTION_ITEMS, hasMorePages: true }),
      status: 400,
    },
    {
      kind: 'the dataset has more than 50 active items',
      setup: () =>
        listDatasetItems.mockResolvedValue({
          items: Array.from({ length: 51 }, (_, index) => datasetItem(`item-${index}`, QUESTION_ITEMS[0].input)),
          hasMorePages: false,
        }),
      status: 400,
    },
    {
      kind: 'no item has a usable input',
      setup: () => listDatasetItems.mockResolvedValue({ items: [datasetItem('item-x', 'text')], hasMorePages: false }),
      status: 400,
    },
    { kind: 'a variant is invalid', setup: () => fetchExperimentPrompt.mockResolvedValue({ config: {} }), status: 400 },
  ])('refuses with $status when $kind', async ({ setup, status }) => {
    setup()

    const prepared = await prepareExperiment(REQUEST)

    expect(prepared.status).toBe(status)
    expect(prepared.error).toEqual(expect.any(String))
  })

  it('lets an unexpected dataset failure reach the caller', async () => {
    listDatasetItems.mockRejectedValue(Object.assign(new Error('down'), { statusCode: 503 }))

    await expect(prepareExperiment(REQUEST)).rejects.toThrow('down')
  })
})

async function runToCompletion(plan) {
  expect(claimExperimentSlot()).toBe(true)
  startExperiment(plan)
  await vi.waitFor(() => expect(claimExperimentSlot()).toBe(true))
  releaseExperimentSlot()
}

describe('startExperiment', () => {
  it('runs every item under every variant with a read-only agent and links each trace to its run', async () => {
    const { value: plan } = await prepareExperiment(REQUEST)

    await runToCompletion(plan)

    expect(createAgent).toHaveBeenCalledTimes(4)
    for (const [, , options] of createAgent.mock.calls) expect(options.readOnly).toBe(true)
    expect(
      createAgent.mock.calls.map(([sources, profile, options]) => [sources, profile, options.promptOverrides])
    ).toEqual([
      [['yolo'], 'support', null],
      [['yolo'], 'support', { sections: COMPACT_CONFIG.sections, tools: {} }],
      [['integration:notion'], 'tech', null],
      [['integration:notion'], 'tech', { sections: COMPACT_CONFIG.sections, tools: {} }],
    ])

    const tracedIds = traceAgentRun.mock.calls.map(([options]) => options.traceId)
    expect(linkDatasetRunItem.mock.calls.map(([, link]) => [link.runName, link.datasetItemId, link.traceId])).toEqual([
      [plan.runs[0].runName, 'item-1', langfuseTraceId(tracedIds[0])],
      [plan.runs[1].runName, 'item-1', langfuseTraceId(tracedIds[1])],
      [plan.runs[0].runName, 'item-2', langfuseTraceId(tracedIds[2])],
      [plan.runs[1].runName, 'item-2', langfuseTraceId(tracedIds[3])],
    ])
    expect(new Set(tracedIds).size).toBe(4)
    expect(forceFlush).toHaveBeenCalledTimes(4)
  })

  it('gives both variants of an item the same input, built once', async () => {
    const { value: plan } = await prepareExperiment(REQUEST)

    await runToCompletion(plan)

    expect(searchSimilarCases).toHaveBeenCalledTimes(2)
    const [firstInput, secondInput] = run.mock.calls.slice(0, 2).map(([, input]) => input)
    expect(firstInput).toBe(secondInput)
  })

  it('records each run on the experiment channel under its own run name', async () => {
    const { value: plan } = await prepareExperiment(REQUEST)

    await runToCompletion(plan)

    expect(trackAgentRun.mock.calls.map(([options]) => [options.channel, options.subject])).toEqual([
      ['experiment', plan.runs[0].runName],
      ['experiment', plan.runs[1].runName],
      ['experiment', plan.runs[0].runName],
      ['experiment', plan.runs[1].runName],
    ])
  })

  it('still links a failed run and keeps going when a link fails', async () => {
    const { value: plan } = await prepareExperiment(REQUEST)
    run.mockRejectedValueOnce(new Error('model unavailable'))
    linkDatasetRunItem.mockRejectedValueOnce(Object.assign(new Error('bad gateway'), { statusCode: 502 }))

    await runToCompletion(plan)

    expect(run).toHaveBeenCalledTimes(4)
    expect(linkDatasetRunItem).toHaveBeenCalledTimes(4)
  })

  it('stops waiting for a run that never ends and links it anyway', async () => {
    vi.useFakeTimers()
    const { value: plan } = await prepareExperiment({ ...REQUEST, variants: [{ baseline: true }] })
    run.mockImplementationOnce(() => new Promise(() => {}))

    expect(claimExperimentSlot()).toBe(true)
    startExperiment(plan)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    await vi.waitFor(() => expect(claimExperimentSlot()).toBe(true))
    releaseExperimentSlot()

    expect(linkDatasetRunItem).toHaveBeenCalledTimes(2)
  })

  it('frees the slot and swallows the failure when the job itself fails', async () => {
    const { value: plan } = await prepareExperiment(REQUEST)
    buildAgentInput.mockImplementationOnce(() => {
      throw new Error('broken input')
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runToCompletion(plan)

    expect(run).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('Experiment failed:', 'Error')
    consoleError.mockRestore()
  })
})

describe('startExperiment run details', () => {
  it('bounds every run by the turn limit and a timeout and traces it under its run name', async () => {
    const { value: plan } = await prepareExperiment({ ...REQUEST, variants: [{ label: 'compact' }] })

    await runToCompletion(plan)

    const config = (await import('../config.js')).default
    for (const [, , options] of run.mock.calls) {
      expect(options).toEqual({ maxTurns: config.agent.maxIterations, signal: expect.any(AbortSignal) })
    }
    expect(traceAgentRun.mock.calls.map(([options]) => [options.sessionId, options.question])).toEqual([
      [plan.runs[0].runName, 'Why did order 42 fail?'],
      [plan.runs[0].runName, 'Who owns refunds?'],
    ])
    expect(linkDatasetRunItem.mock.calls[0][1].metadata).toEqual({ promptVersion: 5, variant: 'compact' })
  })

  it('flushes the traces before linking them', async () => {
    const { value: plan } = await prepareExperiment({ ...REQUEST, variants: [{ baseline: true }] })

    await runToCompletion(plan)

    expect(forceFlush.mock.invocationCallOrder[0]).toBeLessThan(linkDatasetRunItem.mock.invocationCallOrder[0])
  })

  it('asks the knowledge base with the question and runs without similar cases when it is down', async () => {
    const { value: plan } = await prepareExperiment({ ...REQUEST, variants: [{ baseline: true }] })
    searchSimilarCases.mockRejectedValue(new Error('vector store down'))

    await runToCompletion(plan)

    expect(searchSimilarCases).toHaveBeenNthCalledWith(1, 'Why did order 42 fail?')
    expect(run).toHaveBeenCalledTimes(2)
    expect(linkDatasetRunItem).toHaveBeenCalledTimes(2)
  })

  it('skips the link of a variant whose agent could not be built and runs the rest', async () => {
    const { value: plan } = await prepareExperiment(REQUEST)
    createAgent.mockRejectedValueOnce(new Error('A read-only agent was given write tools: post_slack_message.'))

    await runToCompletion(plan)

    expect(run).toHaveBeenCalledTimes(3)
    expect(linkDatasetRunItem.mock.calls.map(([, link]) => [link.runName, link.datasetItemId])).toEqual([
      [plan.runs[1].runName, 'item-1'],
      [plan.runs[0].runName, 'item-2'],
      [plan.runs[1].runName, 'item-2'],
    ])
  })

  it('accepts a dataset of exactly 50 active items', async () => {
    listDatasetItems.mockResolvedValue({
      items: Array.from({ length: 50 }, (_, index) => datasetItem(`item-${index}`, QUESTION_ITEMS[0].input)),
      hasMorePages: false,
    })

    const prepared = await prepareExperiment(REQUEST)

    expect(prepared.value.items).toHaveLength(50)
  })

  it('skips an item whose sources hold an empty name', async () => {
    listDatasetItems.mockResolvedValue({
      items: [...QUESTION_ITEMS, datasetItem('item-empty-source', { question: 'Why?', sources: [''] })],
      hasMorePages: false,
    })

    const prepared = await prepareExperiment(REQUEST)

    expect(prepared.value.skipped).toEqual(['item-empty-source'])
  })
})

describe('claimExperimentSlot', () => {
  it('lets one experiment run at a time', () => {
    expect(claimExperimentSlot()).toBe(true)
    expect(claimExperimentSlot()).toBe(false)

    releaseExperimentSlot()

    expect(claimExperimentSlot()).toBe(true)
  })
})
