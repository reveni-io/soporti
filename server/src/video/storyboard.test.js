import { describe, it, expect, vi, beforeEach } from 'vitest'

class FakeMaxTurnsExceededError extends Error {}

vi.mock('@openai/agents', () => ({
  Agent: vi.fn(function (config) {
    this.config = config
    this.clone = vi.fn(overrides => ({ ...config, ...overrides }))
  }),
  MaxTurnsExceededError: FakeMaxTurnsExceededError,
  run: vi.fn(),
}))
vi.mock('../llm/model.js', () => ({ resolveModelForAgent: vi.fn() }))
vi.mock('../agent/tools.js', () => ({ buildRepoTools: vi.fn() }))
vi.mock('../agent/run-tracking.js', () => ({
  trackAgentRun: vi.fn(async (_options, runAgent) => ({ result: await runAgent() })),
  traceAgentRun: vi.fn((_options, runAgent) => runAgent()),
}))
vi.mock('../db/attachment-images.js', () => ({ getAttachmentImages: vi.fn() }))
vi.mock('../db/videos.js', () => ({
  getVideo: vi.fn(),
  saveStoryboard: vi.fn(),
  failStoryboard: vi.fn(),
  failInterruptedStoryboards: vi.fn(),
}))
vi.mock('./settings.js', () => ({ getVideoModelSelection: vi.fn(), isVideoConfigured: vi.fn() }))

const { Agent, run } = await import('@openai/agents')
const { resolveModelForAgent } = await import('../llm/model.js')
const { buildRepoTools } = await import('../agent/tools.js')
const { trackAgentRun } = await import('../agent/run-tracking.js')
const { getAttachmentImages } = await import('../db/attachment-images.js')
const { getVideo, saveStoryboard, failStoryboard, failInterruptedStoryboards } = await import('../db/videos.js')
const { getVideoModelSelection, isVideoConfigured } = await import('./settings.js')
const { startStoryboardDraft, cancelStoryboardDraft, recoverInterruptedDrafts } = await import('./storyboard.js')

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const IMAGE_ID = '11111111-1111-4111-8111-111111111111'
const SELECTION = { provider: 'anthropic', model: 'claude-opus-5-5', effort: 'max' }
const MODEL_SETTINGS = { reasoning: { effort: 'max' } }
const FINAL_SETTINGS = { reasoning: { effort: 'max' }, toolChoice: 'none' }

function video(overrides = {}) {
  return {
    id: VIDEO_ID,
    title: 'Refunds in one click',
    brief: {
      idea: 'Refunds in one click',
      repos: ['reveni/dashboard'],
      path: null,
      audience: 'merchants',
      language: 'en',
      format: '16:9',
      durationSeconds: 30,
      pace: 'relaxed',
      attachments: [],
    },
    storyboard: null,
    messages: [],
    ...overrides,
  }
}

function scene(start, end, title) {
  return { start, end, title, visual: `${title} visual`, onScreenText: title, sound: 'Soft whoosh' }
}

function agentOutput(scenes, overrides = {}) {
  return {
    reply: '  Here is a first storyboard.  ',
    storyboard: {
      title: 'Refunds',
      summary: 'Refund an order in one click.',
      durationSeconds: 30,
      scenes,
      music: { style: 'lo-fi house', bpm: 112, mood: 'warm' },
      ...overrides,
    },
  }
}

async function settle() {
  await vi.waitFor(() => {
    expect(saveStoryboard.mock.calls.length + failStoryboard.mock.calls.length).toBeGreaterThan(0)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  isVideoConfigured.mockResolvedValue(true)
  getVideoModelSelection.mockResolvedValue(SELECTION)
  resolveModelForAgent.mockResolvedValue({
    model: 'the-model',
    modelSettings: MODEL_SETTINGS,
    finalAnswerModelSettings: FINAL_SETTINGS,
  })
  buildRepoTools.mockReturnValue(['repo-tools'])
  getAttachmentImages.mockResolvedValue(new Map())
  getVideo.mockResolvedValue(video())
  saveStoryboard.mockResolvedValue(true)
  failStoryboard.mockResolvedValue(true)
})

describe('startStoryboardDraft', () => {
  it('runs the agent with the video model and the brief repos, then saves the storyboard and the reply', async () => {
    run.mockResolvedValue({ finalOutput: agentOutput([scene(0, 6, 'Hook'), scene(6, 30, 'Refund')]) })

    startStoryboardDraft(VIDEO_ID, 7)
    await settle()

    expect(getVideo).toHaveBeenCalledWith(VIDEO_ID, 7)
    expect(resolveModelForAgent).toHaveBeenCalledWith(SELECTION)
    expect(buildRepoTools).toHaveBeenCalledWith(['reveni/dashboard'])
    expect(Agent.mock.calls[0][0]).toMatchObject({
      model: 'the-model',
      tools: ['repo-tools'],
      modelSettings: MODEL_SETTINGS,
    })
    expect(trackAgentRun.mock.calls[0][0]).toMatchObject({ channel: 'video_storyboard', subject: VIDEO_ID, userId: 7 })
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][1]).toContain('Draft the storyboard for this brief.')
    expect(run.mock.calls[0][2]).toMatchObject({ maxTurns: 80 })
    expect(saveStoryboard).toHaveBeenCalledTimes(1)
    expect(saveStoryboard).toHaveBeenCalledWith(VIDEO_ID, 7, {
      title: 'Refunds',
      storyboard: agentOutput([scene(0, 6, 'Hook'), scene(6, 30, 'Refund')]).storyboard,
      reply: 'Here is a first storyboard.',
    })
    expect(failStoryboard).not.toHaveBeenCalled()
  })

  it('makes the scenes contiguous from 0 and fits them to the requested duration', async () => {
    run.mockResolvedValue({
      finalOutput: agentOutput([scene(10, 20, 'Second'), scene(1, 6, 'First'), scene(22, 22, 'Third')], {
        durationSeconds: 24,
      }),
    })

    startStoryboardDraft(VIDEO_ID, 7)
    await settle()

    const { storyboard } = saveStoryboard.mock.calls[0][2]
    expect(storyboard.durationSeconds).toBe(30)
    expect(storyboard.scenes.map(({ title, start, end }) => [title, start, end])).toEqual([
      ['First', 0, 9.7],
      ['Second', 9.7, 29],
      ['Third', 29, 30],
    ])
  })

  it('sends the images of the brief that are still stored as input images', async () => {
    const attachments = [
      { name: 'screen.png', imageId: IMAGE_ID },
      { name: 'spec.pdf', text: 'Refund spec' },
    ]
    getVideo.mockResolvedValue(video({ brief: { ...video().brief, attachments } }))
    getAttachmentImages.mockResolvedValue(new Map([[IMAGE_ID, 'data:image/png;base64,aGk=']]))
    run.mockResolvedValue({ finalOutput: agentOutput([scene(0, 30, 'Only')]) })

    startStoryboardDraft(VIDEO_ID, 7)
    await settle()

    expect(getAttachmentImages).toHaveBeenCalledWith([IMAGE_ID], 7)
    const [message] = run.mock.calls[0][1]
    expect(message.content[0].text).toContain('- screen.png (attached below)')
    expect(message.content[0].text).toContain('### spec.pdf\n\nRefund spec')
    expect(message.content[1]).toEqual({ type: 'input_image', image: 'data:image/png;base64,aGk=' })
  })

  it('records a readable error when the agent fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    run.mockRejectedValue(new Error('upstream 500'))

    startStoryboardDraft(VIDEO_ID, 7)
    await settle()

    expect(failStoryboard).toHaveBeenCalledTimes(1)
    expect(failStoryboard).toHaveBeenCalledWith(VIDEO_ID, 7, 'The storyboard could not be drafted. Try again.')
    expect(saveStoryboard).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('says so when the agent runs out of turns', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    run.mockRejectedValue(new FakeMaxTurnsExceededError('max turns'))

    startStoryboardDraft(VIDEO_ID, 7)
    await settle()

    expect(failStoryboard).toHaveBeenCalledWith(
      VIDEO_ID,
      7,
      'The storyboard agent ran out of turns before proposing a storyboard. Try again.'
    )
    consoleError.mockRestore()
  })

  it('asks for the final answer at the turn limit with the final-answer settings', async () => {
    run.mockImplementationOnce(async (_agent, _input, options) => {
      return options.errorHandlers.maxTurns({ context: {}, runData: { history: [{ role: 'user', content: 'go' }] } })
    })
    run.mockResolvedValueOnce({ finalOutput: agentOutput([scene(0, 30, 'Only')]) })

    startStoryboardDraft(VIDEO_ID, 7)
    await settle()

    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1][0]).toMatchObject({ modelSettings: FINAL_SETTINGS })
    expect(run.mock.calls[1][1].at(-1).content).toContain('all 80 turns')
    expect(run.mock.calls[1][2]).toMatchObject({ maxTurns: 1 })
    expect(saveStoryboard).toHaveBeenCalledTimes(1)
  })

  it('fails the draft when the wrap-up at the turn limit fails too', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    run.mockImplementationOnce(async (_agent, _input, options) => {
      const handled = await options.errorHandlers.maxTurns({ context: {}, runData: { history: [] } })
      return handled ?? { finalOutput: null }
    })
    run.mockRejectedValueOnce(new Error('wrap-up failed'))

    startStoryboardDraft(VIDEO_ID, 7)
    await settle()

    expect(failStoryboard).toHaveBeenCalledWith(VIDEO_ID, 7, 'The storyboard could not be drafted. Try again.')
    consoleError.mockRestore()
  })

  it('rejects a storyboard without scenes', async () => {
    run.mockResolvedValue({ finalOutput: agentOutput([]) })

    startStoryboardDraft(VIDEO_ID, 7)
    await settle()

    expect(failStoryboard).toHaveBeenCalledWith(VIDEO_ID, 7, 'The storyboard came back without scenes. Try again.')
  })

  it('fails without calling the model when video generation is not configured', async () => {
    isVideoConfigured.mockResolvedValue(false)

    startStoryboardDraft(VIDEO_ID, 7)
    await settle()

    expect(run).not.toHaveBeenCalled()
    expect(failStoryboard).toHaveBeenCalledWith(
      VIDEO_ID,
      7,
      'Video generation is not configured yet. Ask an admin to set it up in /admin (Video section).'
    )
  })

  it('does nothing when the video is gone', async () => {
    getVideo.mockResolvedValue(null)

    startStoryboardDraft(VIDEO_ID, 7)
    await vi.waitFor(() => expect(getVideo).toHaveBeenCalledTimes(1))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(run).not.toHaveBeenCalled()
    expect(saveStoryboard).not.toHaveBeenCalled()
    expect(failStoryboard).not.toHaveBeenCalled()
  })

  it('runs one draft per video at a time', async () => {
    let finish
    run.mockImplementation(() => new Promise(resolve => (finish = resolve)))

    startStoryboardDraft(VIDEO_ID, 7)
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    startStoryboardDraft(VIDEO_ID, 7)
    finish({ finalOutput: agentOutput([scene(0, 30, 'Only')]) })
    await settle()

    expect(getVideo).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(saveStoryboard).toHaveBeenCalledTimes(1)

    run.mockResolvedValue({ finalOutput: agentOutput([scene(0, 30, 'Again')]) })
    startStoryboardDraft(VIDEO_ID, 7)
    await vi.waitFor(() => expect(saveStoryboard).toHaveBeenCalledTimes(2))
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('records nothing when the draft is cancelled', async () => {
    run.mockImplementation((_agent, _input, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })

    startStoryboardDraft(VIDEO_ID, 7)
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    cancelStoryboardDraft(VIDEO_ID)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(saveStoryboard).not.toHaveBeenCalled()
    expect(failStoryboard).not.toHaveBeenCalled()
  })

  it('logs when saving the outcome fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    run.mockResolvedValue({ finalOutput: agentOutput([scene(0, 30, 'Only')]) })
    saveStoryboard.mockRejectedValue(new Error('db down'))

    startStoryboardDraft(VIDEO_ID, 7)
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1))

    expect(consoleError.mock.calls[0][0]).toContain(`Failed to save the storyboard outcome of video ${VIDEO_ID}`)
    consoleError.mockRestore()
  })
})

describe('cancelStoryboardDraft', () => {
  it('ignores a video without a running draft', () => {
    expect(() => cancelStoryboardDraft(VIDEO_ID)).not.toThrow()
  })
})

describe('recoverInterruptedDrafts', () => {
  it('fails the drafts a restart interrupted', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    failInterruptedStoryboards.mockResolvedValue(2)

    expect(await recoverInterruptedDrafts()).toBe(2)
    expect(failInterruptedStoryboards).toHaveBeenCalledTimes(1)
    expect(failInterruptedStoryboards).toHaveBeenCalledWith('The storyboard was interrupted by a restart. Try again.')
    expect(consoleLog).toHaveBeenCalledTimes(1)
    consoleLog.mockRestore()
  })

  it('stays quiet when nothing was interrupted', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    failInterruptedStoryboards.mockResolvedValue(0)

    expect(await recoverInterruptedDrafts()).toBe(0)
    expect(consoleLog).not.toHaveBeenCalled()
    consoleLog.mockRestore()
  })
})
