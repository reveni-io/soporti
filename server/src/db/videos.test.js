import { describe, it, expect, vi, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'

let queue = []
let calls = []

function tableName(ref) {
  return ref?.[Symbol.for('drizzle:Name')] ?? null
}

function makeChain(op, target) {
  const call = { op, target: tableName(target), steps: {} }
  calls.push(call)
  const chain = {
    from: table => {
      call.target = tableName(table)
      return chain
    },
    where: condition => {
      call.steps.where = condition
      return chain
    },
    orderBy: () => chain,
    limit: () => chain,
    set: v => {
      call.steps.set = v
      return chain
    },
    values: v => {
      call.steps.values = v
      return chain
    },
    returning: () => chain,
    then: (resolve, reject) => {
      const next = queue.shift()
      const promise = next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? [])
      return promise.then(resolve, reject)
    },
  }
  return chain
}

const handle = {
  select: () => makeChain('select'),
  insert: table => makeChain('insert', table),
  update: table => makeChain('update', table),
  delete: table => makeChain('delete', table),
  transaction: fn => fn(handle),
}

vi.mock('./index.js', () => ({ getDb: () => handle }))

const { videos } = await import('./schema.js')
const {
  createVideo,
  listVideoSummaries,
  getVideo,
  claimStoryboardDraft,
  saveStoryboard,
  failStoryboard,
  failInterruptedStoryboards,
  deleteVideo,
} = await import('./videos.js')

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'
const BRIEF = { idea: 'Refunds in one click', format: '16:9', durationSeconds: 30 }
const STORYBOARD = { title: 'Refunds', scenes: [] }

function ownedInStage(stage) {
  return and(and(eq(videos.id, VIDEO_ID), eq(videos.userId, 7)), eq(videos.stage, stage))
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('createVideo', () => {
  it('inserts the video in the drafting stage and returns its id', async () => {
    queue = [[{ id: VIDEO_ID }]]

    const id = await createVideo(7, { title: 'Refunds', brief: BRIEF })

    expect(id).toBe(VIDEO_ID)
    expect(calls).toHaveLength(1)
    expect(calls[0].target).toBe('videos')
    expect(calls[0].steps.values).toMatchObject({
      userId: 7,
      title: 'Refunds',
      brief: BRIEF,
      stage: 'drafting',
      parentVideoId: null,
    })
  })
})

describe('listVideoSummaries', () => {
  it('lists only the videos of the user', async () => {
    const rows = [{ id: VIDEO_ID, title: 'Refunds' }]
    queue = [rows]

    expect(await listVideoSummaries(7)).toEqual(rows)
    expect(calls[0].steps.where).toEqual(eq(videos.userId, 7))
  })
})

describe('getVideo', () => {
  it('returns the video with its messages', async () => {
    const messages = [{ id: 1, role: 'user', content: 'Shorter intro', version: null }]
    queue = [[{ id: VIDEO_ID, title: 'Refunds' }], messages]

    const video = await getVideo(VIDEO_ID, 7)

    expect(video).toEqual({ id: VIDEO_ID, title: 'Refunds', messages })
    expect(calls[0].steps.where).toEqual(and(eq(videos.id, VIDEO_ID), eq(videos.userId, 7)))
    expect(calls[1].target).toBe('video_messages')
  })

  it('returns null without loading messages when the video is missing or not owned', async () => {
    queue = [[]]

    expect(await getVideo(VIDEO_ID, 7)).toBeNull()
    expect(calls).toHaveLength(1)
  })
})

describe('claimStoryboardDraft', () => {
  it('moves a storyboard-stage video to drafting and stores the request', async () => {
    queue = [[{ id: VIDEO_ID }], []]

    expect(await claimStoryboardDraft(VIDEO_ID, 7, { request: 'Shorter intro' })).toBe(true)

    expect(calls[0].steps.where).toEqual(ownedInStage('storyboard'))
    expect(calls[0].steps.set).toMatchObject({ stage: 'drafting', storyboardError: null })
    expect(calls[1].target).toBe('video_messages')
    expect(calls[1].steps.values).toEqual({ videoId: VIDEO_ID, role: 'user', content: 'Shorter intro' })
  })

  it('stores no message when there is no request', async () => {
    queue = [[{ id: VIDEO_ID }]]

    expect(await claimStoryboardDraft(VIDEO_ID, 7)).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('returns false when the video is not in the storyboard stage', async () => {
    queue = [[]]

    expect(await claimStoryboardDraft(VIDEO_ID, 7, { request: 'Shorter intro' })).toBe(false)
    expect(calls).toHaveLength(1)
  })
})

describe('saveStoryboard', () => {
  it('saves the storyboard, leaves drafting and adds the assistant reply', async () => {
    queue = [[{ id: VIDEO_ID }], []]

    const saved = await saveStoryboard(VIDEO_ID, 7, { title: 'Refunds', storyboard: STORYBOARD, reply: 'Here it is.' })

    expect(saved).toBe(true)
    expect(calls[0].steps.where).toEqual(ownedInStage('drafting'))
    expect(calls[0].steps.set).toMatchObject({
      title: 'Refunds',
      storyboard: STORYBOARD,
      stage: 'storyboard',
      storyboardError: null,
    })
    expect(calls[1].steps.values).toEqual({ videoId: VIDEO_ID, role: 'assistant', content: 'Here it is.' })
  })

  it('adds no message when the video is no longer drafting', async () => {
    queue = [[]]

    expect(await saveStoryboard(VIDEO_ID, 7, { title: 'Refunds', storyboard: STORYBOARD, reply: 'Hi' })).toBe(false)
    expect(calls).toHaveLength(1)
  })
})

describe('failStoryboard', () => {
  it('returns the drafting video to the storyboard stage with the error', async () => {
    queue = [[{ id: VIDEO_ID }]]

    expect(await failStoryboard(VIDEO_ID, 7, 'Try again.')).toBe(true)
    expect(calls[0].steps.where).toEqual(ownedInStage('drafting'))
    expect(calls[0].steps.set).toMatchObject({ stage: 'storyboard', storyboardError: 'Try again.' })
  })

  it('returns false when the video is gone', async () => {
    queue = [[]]

    expect(await failStoryboard(VIDEO_ID, 7, 'Try again.')).toBe(false)
  })
})

describe('failInterruptedStoryboards', () => {
  it('moves every drafting video to the storyboard stage and counts them', async () => {
    queue = [[{ id: VIDEO_ID }, { id: 'other' }]]

    expect(await failInterruptedStoryboards('Interrupted.')).toBe(2)
    expect(calls[0].steps.where).toEqual(eq(videos.stage, 'drafting'))
    expect(calls[0].steps.set).toMatchObject({ stage: 'storyboard', storyboardError: 'Interrupted.' })
  })
})

describe('deleteVideo', () => {
  it('deletes an owned video', async () => {
    queue = [[{ id: VIDEO_ID }]]

    expect(await deleteVideo(VIDEO_ID, 7)).toBe(true)
    expect(calls[0].steps.where).toEqual(and(eq(videos.id, VIDEO_ID), eq(videos.userId, 7)))
  })

  it('returns false when the video is missing or not owned', async () => {
    queue = [[]]

    expect(await deleteVideo(VIDEO_ID, 7)).toBe(false)
  })
})
