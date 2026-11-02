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
      this.clone = vi.fn(overrides => ({ ...config, ...overrides }))
    }),
    MaxTurnsExceededError: FakeMaxTurnsExceededError,
    run: vi.fn(),
  }
})
vi.mock('../config.js', () => ({ default: { video: { maxTurns: 300 } } }))
vi.mock('../llm/model.js', () => ({ resolveModelForAgent: vi.fn() }))
vi.mock('../agent/run-tracking.js', () => {
  return {
    trackAgentRun: vi.fn(async (options, runAgent) => {
      const result = await runAgent()
      const failure = options.failureReason?.(result)
      if (failure) throw new Error(failure)
      return { result }
    }),
    traceAgentRun: vi.fn((_options, runAgent) => runAgent()),
  }
})
vi.mock('../db/video-files.js', () => ({ listProjectFiles: vi.fn() }))
vi.mock('../db/video-versions.js', () => ({ getVersionSummary: vi.fn() }))
vi.mock('./settings.js', () => ({ getVideoModelSelection: vi.fn(), isVideoConfigured: vi.fn() }))
vi.mock('./brief.js', () => ({ loadBriefImages: vi.fn() }))
vi.mock('./tools.js', () => {
  return {
    buildVideoTools: vi.fn(() => [{ name: 'check_video' }]),
    describeToolStep: vi.fn(name => `step of ${name}`),
    runVideoCheck: vi.fn(),
  }
})

const { Agent, run } = await import('@openai/agents')
const { resolveModelForAgent } = await import('../llm/model.js')
const { trackAgentRun, traceAgentRun } = await import('../agent/run-tracking.js')
const { listProjectFiles } = await import('../db/video-files.js')
const { getVersionSummary } = await import('../db/video-versions.js')
const { getVideoModelSelection, isVideoConfigured } = await import('./settings.js')
const { loadBriefImages } = await import('./brief.js')
const { buildVideoTools, runVideoCheck } = await import('./tools.js')
const { VIDEO_INSTRUCTIONS } = await import('./prompt.js')
const { VideoProjectError } = await import('./project-error.js')
const { composeVideo } = await import('./agent.js')

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const IMAGE_ID = '11111111-1111-4111-8111-111111111111'
const SELECTION = { provider: 'anthropic', model: 'claude-opus-5-5', effort: 'max' }
const MODEL_SETTINGS = { reasoning: { effort: 'max' } }
const FINAL_SETTINGS = { reasoning: { effort: 'max' }, toolChoice: 'none' }
const PASSING = { ok: true, errors: [] }
const FAILING = { ok: false, errors: ['Caption "Hi" is readable for 0.4 s but needs 0.9 s.', 'Second.', 'Third.'] }

let reporter

function job(overrides = {}) {
  return {
    id: 41,
    videoId: VIDEO_ID,
    version: 1,
    basedOn: null,
    request: null,
    resume: false,
    video: {
      id: VIDEO_ID,
      userId: 7,
      title: 'Refunds',
      brief: {
        idea: 'Refunds in one click',
        repos: ['acme/web'],
        path: null,
        audience: 'merchants',
        language: 'en',
        format: '16:9',
        durationSeconds: 30,
        pace: 'relaxed',
        attachments: [{ name: 'shot.png', imageId: IMAGE_ID }],
      },
      storyboard: { title: 'Refunds', scenes: [] },
    },
    ...overrides,
  }
}

function checksAs(report) {
  buildVideoTools.mockImplementation(ctx => {
    ctx.state.lastCheck = report
    return [{ name: 'check_video' }]
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  reporter = { step: vi.fn(), event: vi.fn() }
  isVideoConfigured.mockResolvedValue(true)
  getVideoModelSelection.mockResolvedValue(SELECTION)
  resolveModelForAgent.mockResolvedValue({
    model: 'model',
    modelSettings: MODEL_SETTINGS,
    finalAnswerModelSettings: FINAL_SETTINGS,
  })
  loadBriefImages.mockResolvedValue([{ id: IMAGE_ID, image: 'data:image/png;base64,AAAA' }])
  listProjectFiles.mockResolvedValue([])
  getVersionSummary.mockResolvedValue(null)
  checksAs(PASSING)
  run.mockResolvedValue({ finalOutput: '  A short tour of one-click refunds.  ' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('composeVideo', () => {
  it('refuses to run when video generation is not configured', async () => {
    isVideoConfigured.mockResolvedValue(false)

    await expect(composeVideo(job(), { signal: new AbortController().signal, reporter })).rejects.toThrow(
      'Video generation is not configured yet.'
    )
    expect(run).not.toHaveBeenCalled()
  })

  it('runs the composer with the video model, its tools, the brief images and the turn limit', async () => {
    const { signal } = new AbortController()

    const result = await composeVideo(job(), { signal, reporter })

    expect(result).toEqual({ summary: 'A short tour of one-click refunds.' })
    expect(resolveModelForAgent).toHaveBeenCalledWith(SELECTION)
    expect(Agent).toHaveBeenCalledWith({
      name: 'Video composer',
      model: 'model',
      instructions: VIDEO_INSTRUCTIONS,
      tools: [{ name: 'check_video' }],
      modelSettings: MODEL_SETTINGS,
    })
    expect(buildVideoTools).toHaveBeenCalledWith(
      expect.objectContaining({ job: expect.objectContaining({ id: 41 }), reporter })
    )
    expect(run).toHaveBeenCalledTimes(1)
    const [, input, options] = run.mock.calls[0]
    expect(input[0].content[0].text).toContain('Compose the video from scratch with the approved storyboard.')
    expect(input[0].content[0].text).toContain('- shot.png (attached below)')
    expect(input[0].content[1]).toEqual({ type: 'input_image', image: 'data:image/png;base64,AAAA' })
    expect(options).toMatchObject({ maxTurns: 300, signal, toolNotFoundBehavior: 'return_error_to_model' })
    expect(trackAgentRun.mock.calls[0][0]).toMatchObject({ channel: 'video', subject: VIDEO_ID, userId: 7 })
    expect(traceAgentRun.mock.calls[0][0]).toEqual({ sessionId: VIDEO_ID, userId: 7, question: 'Refunds in one click' })
  })

  it('shows every tool call as the step of the version', async () => {
    await composeVideo(job(), { signal: new AbortController().signal, reporter })
    const agent = Agent.mock.instances[0]

    agent.listeners.agent_tool_start({}, { name: 'write_project_file' }, { toolCall: { arguments: '{"path":"a.js"}' } })

    expect(reporter.step).toHaveBeenCalledWith('step of write_project_file')
  })

  it('tells the agent to edit the copied files and passes the previous summary for a change request', async () => {
    listProjectFiles.mockResolvedValue([{ path: 'scenes.js', bytes: 10 }])
    getVersionSummary.mockResolvedValue('A tour of the refunds page.')

    await composeVideo(job({ version: 2, basedOn: 1, request: 'Make it orange.' }), {
      signal: new AbortController().signal,
      reporter,
    })

    const text = run.mock.calls[0][1][0].content[0].text
    expect(getVersionSummary).toHaveBeenCalledWith(VIDEO_ID, 1)
    expect(text).toContain('## Version 1')
    expect(text).toContain('What it shows: A tour of the refunds page.')
    expect(text).toContain('## Change request\n\nMake it orange.')
    expect(text).toContain('Edit the project to answer the change request.')
  })

  it('tells the agent to continue from the files written before a restart', async () => {
    listProjectFiles.mockResolvedValue([{ path: 'scenes.js', bytes: 10 }])

    await composeVideo(job({ resume: true }), { signal: new AbortController().signal, reporter })

    expect(run.mock.calls[0][1][0].content[0].text).toContain('continue from them instead of starting over')
  })

  it('checks the final files itself when the last change came after the last check', async () => {
    checksAs(null)
    runVideoCheck.mockImplementation(async ctx => {
      ctx.state.lastCheck = PASSING
      return PASSING
    })

    await composeVideo(job(), { signal: new AbortController().signal, reporter })

    expect(runVideoCheck).toHaveBeenCalledTimes(1)
  })

  it('fails with the first problem of the last check when it did not pass', async () => {
    checksAs(FAILING)

    const promise = composeVideo(job(), { signal: new AbortController().signal, reporter })

    await expect(promise).rejects.toThrow(VideoProjectError)
    await expect(promise).rejects.toThrow(
      'The video did not pass its last check: Caption "Hi" is readable for 0.4 s but needs 0.9 s. (and 2 more problems)'
    )
  })

  it('falls back to a default summary when the agent says nothing', async () => {
    run.mockResolvedValue({ finalOutput: '' })

    const result = await composeVideo(job(), { signal: new AbortController().signal, reporter })

    expect(result).toEqual({ summary: 'The video is composed.' })
  })

  it('wraps up at the turn limit with one last turn that cannot call tools', async () => {
    run.mockResolvedValueOnce({ finalOutput: 'Done.' }).mockResolvedValueOnce({ finalOutput: 'Wrapped up.' })
    await composeVideo(job(), { signal: new AbortController().signal, reporter })
    const { maxTurns: wrapUp } = run.mock.calls[0][2].errorHandlers

    const output = await wrapUp({ context: { ctx: true }, runData: { history: [{ role: 'user', content: 'hi' }] } })

    expect(output).toEqual({ finalOutput: 'Wrapped up.' })
    const [agent, history, options] = run.mock.calls[1]
    expect(agent.modelSettings).toEqual(FINAL_SETTINGS)
    expect(history.at(-1).content).toContain('You have used all 300 turns of this run')
    expect(options).toMatchObject({ maxTurns: 1, context: { ctx: true } })
  })

  it('lets the turn limit error through when the wrap-up fails, as a sentence', async () => {
    checksAs(null)
    run.mockRejectedValue(new FakeMaxTurnsExceededError('max turns'))
    let wrapUpResult
    run.mockImplementationOnce(async (_agent, _input, options) => {
      wrapUpResult = await options.errorHandlers.maxTurns({ context: {}, runData: { history: [] } })
      throw new FakeMaxTurnsExceededError('max turns')
    })

    await expect(composeVideo(job(), { signal: new AbortController().signal, reporter })).rejects.toThrow(
      'The video agent ran out of turns before the video passed its checks.'
    )
    expect(wrapUpResult).toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      '[videos] Failed to wrap up a composition at the turn limit:',
      41,
      expect.any(FakeMaxTurnsExceededError)
    )
  })

  it('lets any other error through untouched', async () => {
    checksAs(null)
    run.mockRejectedValue(new Error('provider down'))

    await expect(composeVideo(job(), { signal: new AbortController().signal, reporter })).rejects.toThrow(
      'provider down'
    )
  })
})
