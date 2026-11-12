import { describe, it, expect, vi, beforeEach } from 'vitest'

class FakeMaxTurnsExceededError extends Error {}

vi.mock('@openai/agents', () => {
  return {
    Agent: vi.fn(function (config) {
      this.config = config
      this.listeners = {}
      this.on = vi.fn((event, listener) => {
        this.listeners[event] = listener
      })
    }),
    MaxTurnsExceededError: FakeMaxTurnsExceededError,
  }
})
vi.mock('../agent/run-streamed.js', () => ({ runStreamed: vi.fn() }))
vi.mock('../llm/model.js', () => ({ resolveModelForAgent: vi.fn() }))
vi.mock('../agent/tools.js', () => {
  return {
    listDatabaseSchemasTool: { name: 'list_database_schemas' },
    listDatabaseTablesTool: { name: 'list_database_tables' },
    describeDatabaseTableTool: { name: 'describe_database_table' },
    queryDatabaseTool: { name: 'query_database' },
  }
})
vi.mock('../agent/run-tracking.js', () => {
  return {
    trackAgentRun: vi.fn(async (options, runAgent) => {
      const result = await runAgent()
      const failure = options.failureReason(result)
      if (failure) throw new Error(failure)
      return { result }
    }),
    traceAgentRun: vi.fn((_options, runAgent) => runAgent()),
  }
})
vi.mock('./tools.js', () => {
  return {
    buildSubmitChartTool: vi.fn(() => ({ name: 'submit_chart' })),
    describeToolStep: vi.fn((name, rawArguments) => `step of ${name} ${rawArguments}`),
  }
})

const { Agent } = await import('@openai/agents')
const { runStreamed } = await import('../agent/run-streamed.js')
const { resolveModelForAgent } = await import('../llm/model.js')
const { trackAgentRun, traceAgentRun } = await import('../agent/run-tracking.js')
const { buildSubmitChartTool } = await import('./tools.js')
const { ANALYTICS_INSTRUCTIONS } = await import('./prompt.js')
const { ChartGenerationError, generateChart } = await import('./agent.js')

const CARD_ID = '8c1d2e3f-4a5b-4c6d-9e7f-a0b1c2d3e4f5'
const MODEL_SETTINGS = { reasoning: { effort: 'medium' } }
const CHART = {
  type: 'bar',
  xKey: 'week',
  groupKey: null,
  series: [{ key: 'returns', label: 'Returns' }],
  stacked: false,
}
const SUBMISSION = { title: 'Returns per week', sql: 'SELECT week, returns FROM weekly_returns', chart: CHART }
const TURN_LIMIT_ERROR =
  'The assistant ran out of steps before it could build the chart. Try again or ask for something simpler.'

let onStep
let signal

function card(overrides = {}) {
  return {
    id: CARD_ID,
    title: 'Returns per week over the last 3 months',
    prompt: 'Returns per week over the last 3 months',
    sql: null,
    chart: null,
    ...overrides,
  }
}

function runState() {
  return buildSubmitChartTool.mock.calls[0][0].state
}

function agentConfig() {
  return Agent.mock.calls[0][0]
}

function generate(target = card()) {
  return generateChart(target, { userId: 7, signal, onStep })
}

function finishRun({ submission = null, settled = false, finalOutput = '', error = null }) {
  runStreamed.mockImplementation(async () => {
    Object.assign(runState(), { submission, settled })
    if (error) throw error

    return { finalOutput }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  onStep = vi.fn()
  signal = new AbortController().signal
  resolveModelForAgent.mockResolvedValue({
    model: 'the-model',
    modelSettings: MODEL_SETTINGS,
    finalAnswerModelSettings: { ...MODEL_SETTINGS, toolChoice: 'none' },
  })
})

describe('generateChart', () => {
  it('runs the assistant model with the database tools and returns the submitted chart', async () => {
    finishRun({ submission: SUBMISSION, settled: true, finalOutput: 'The chart is submitted.' })

    const result = await generate()

    expect(result).toEqual(SUBMISSION)
    expect(resolveModelForAgent).toHaveBeenCalledTimes(1)
    expect(resolveModelForAgent).toHaveBeenCalledWith()
    expect(Agent).toHaveBeenCalledTimes(1)
    expect(agentConfig()).toMatchObject({
      name: 'Analytics chart',
      model: 'the-model',
      instructions: ANALYTICS_INSTRUCTIONS,
      modelSettings: MODEL_SETTINGS,
    })
    expect(agentConfig().tools.map(item => item.name)).toEqual([
      'list_database_schemas',
      'list_database_tables',
      'describe_database_table',
      'query_database',
      'submit_chart',
    ])
    expect(runStreamed).toHaveBeenCalledTimes(1)
    expect(runStreamed.mock.calls[0][0]).toBe(Agent.mock.instances[0])
    expect(runStreamed.mock.calls[0][1]).toBe(
      'Build a dashboard card for this request.\n\n## Request\n\nReturns per week over the last 3 months'
    )
    expect(runStreamed.mock.calls[0][2]).toEqual({
      maxTurns: 30,
      signal,
      toolNotFoundBehavior: 'return_error_to_model',
    })
  })

  it('records the run on the analytics channel and traces it under the card', async () => {
    finishRun({ submission: SUBMISSION, settled: true })

    await generate()

    expect(trackAgentRun).toHaveBeenCalledTimes(1)
    expect(trackAgentRun.mock.calls[0][0]).toMatchObject({ channel: 'analytics', subject: CARD_ID, userId: 7 })
    expect(traceAgentRun).toHaveBeenCalledTimes(1)
    expect(traceAgentRun.mock.calls[0][0]).toEqual({
      sessionId: CARD_ID,
      userId: 7,
      question: 'Returns per week over the last 3 months',
    })
  })

  it('gives the submit tool the card and a fresh run state', async () => {
    const target = card()
    runStreamed.mockResolvedValue({ finalOutput: '' })

    await generate(target).catch(() => {})

    expect(buildSubmitChartTool).toHaveBeenCalledTimes(1)
    expect(buildSubmitChartTool.mock.calls[0][0]).toMatchObject({
      card: target,
      state: { submission: null, settled: false, reply: '' },
    })
  })

  it('sends the current card and the requested change when the card already has a query', async () => {
    finishRun({ submission: SUBMISSION, settled: true })

    await generate(card({ title: 'Returns per week', prompt: 'Make it monthly', sql: SUBMISSION.sql, chart: CHART }))

    const input = runStreamed.mock.calls[0][1]
    expect(input).toMatch(/^Revise this dashboard card\./)
    expect(input).toContain(SUBMISSION.sql)
    expect(input).toMatch(/## Requested change\n\nMake it monthly$/)
    expect(traceAgentRun.mock.calls[0][0].question).toBe('Make it monthly')
  })

  it('ends the run as soon as a submission is settled, and lets the model go on until then', async () => {
    finishRun({ submission: SUBMISSION, settled: true })
    await generate()
    const { toolUseBehavior } = agentConfig()

    runState().settled = false
    expect(toolUseBehavior({}, [])).toEqual({ isFinalOutput: false, isInterrupted: undefined })

    runState().settled = true
    expect(toolUseBehavior({}, [])).toEqual({
      isFinalOutput: true,
      isInterrupted: undefined,
      finalOutput: 'The chart is submitted.',
    })
  })

  it('reports a step for every tool the agent starts', async () => {
    runStreamed.mockImplementation(async agent => {
      agent.listeners.agent_tool_start({}, { name: 'describe_database_table' }, { toolCall: { arguments: '{"a":1}' } })
      agent.listeners.agent_tool_start({}, { name: 'query_database' }, {})
      runState().submission = SUBMISSION

      return { finalOutput: '' }
    })

    await generate()

    expect(onStep).toHaveBeenCalledTimes(2)
    expect(onStep).toHaveBeenNthCalledWith(1, 'step of describe_database_table {"a":1}')
    expect(onStep).toHaveBeenNthCalledWith(2, 'step of query_database undefined')
  })

  it('keeps a chart that was submitted when the model ends with a remark', async () => {
    finishRun({ submission: SUBMISSION, finalOutput: 'There were no returns in that period.' })

    expect(await generate()).toEqual(SUBMISSION)
  })

  it('fails with the sentence of the model when it explains why it submitted nothing', async () => {
    finishRun({ finalOutput: '  The database has no table\n about returns.  ' })

    const failure = await generate().catch(err => err)

    expect(failure).toBeInstanceOf(ChartGenerationError)
    expect(failure.message).toBe('The database has no table about returns.')
  })

  it('caps a long explanation', async () => {
    finishRun({ finalOutput: 'There is no data. '.repeat(40) })

    const failure = await generate().catch(err => err)

    expect(failure).toBeInstanceOf(ChartGenerationError)
    expect(failure.message).toHaveLength(300)
    expect(failure.message.endsWith('…')).toBe(true)
  })

  it.each([
    { kind: 'says nothing', finalOutput: '' },
    { kind: 'returns something that is not text', finalOutput: { reply: 'done' } },
  ])('fails without a user-facing sentence when the model submits nothing and $kind', async ({ finalOutput }) => {
    finishRun({ finalOutput })

    const failure = await generate().catch(err => err)

    expect(failure).not.toBeInstanceOf(ChartGenerationError)
    expect(failure.message).toBe('The analytics agent finished without submitting a chart.')
  })

  it('says so when the agent runs out of turns before submitting a chart', async () => {
    finishRun({ error: new FakeMaxTurnsExceededError('Max turns (30) exceeded') })

    const failure = await generate().catch(err => err)

    expect(failure).toBeInstanceOf(ChartGenerationError)
    expect(failure.message).toBe(TURN_LIMIT_ERROR)
  })

  it('keeps the chart it had submitted when the run fails afterwards, and logs the failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new FakeMaxTurnsExceededError('Max turns (30) exceeded')
    finishRun({ submission: SUBMISSION, error })

    expect(await generate()).toEqual(SUBMISSION)
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      '[analytics] The chart agent stopped after it had submitted a chart:',
      CARD_ID,
      error
    )
    consoleError.mockRestore()
  })

  it('rethrows an unexpected failure untouched when nothing was submitted', async () => {
    const error = new Error('upstream 500')
    finishRun({ error })

    await expect(generate()).rejects.toBe(error)
  })

  it('rethrows when the run was cancelled, even after a submission', async () => {
    const controller = new AbortController()
    const error = new Error('This operation was aborted')
    signal = controller.signal
    runStreamed.mockImplementation(async () => {
      runState().submission = SUBMISSION
      controller.abort()
      throw error
    })

    await expect(generate()).rejects.toBe(error)
  })
})
