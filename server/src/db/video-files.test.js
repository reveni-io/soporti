import { describe, it, expect, vi, beforeEach } from 'vitest'

let queue = []
let calls = []

function tableName(ref) {
  return ref?.[Symbol.for('drizzle:Name')] ?? null
}

function makeChain(op, target) {
  const call = { op, target: tableName(target), steps: {} }
  calls.push(call)
  const record = name => value => {
    call.steps[name] = value
    return chain
  }
  const chain = {
    from: table => {
      call.target = tableName(table)
      return chain
    },
    where: record('where'),
    set: record('set'),
    values: record('values'),
    for: record('for'),
    orderBy: () => chain,
    limit: () => chain,
    innerJoin: () => chain,
    returning: () => chain,
    onConflictDoUpdate: record('onConflict'),
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

const db = await import('./video-files.js')

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

function writes(op, target) {
  return calls.filter(call => call.op === op && call.target === target)
}

beforeEach(() => {
  queue = []
  calls = []
})

describe('project files', () => {
  it('lists the files with their sizes', async () => {
    queue = [[{ path: 'scenes.js', bytes: 120 }]]

    expect(await db.listProjectFiles(41)).toEqual([{ path: 'scenes.js', bytes: 120 }])
    expect(calls[0].target).toBe('video_files')
  })

  it('reads all the files as a map of path to content', async () => {
    queue = [
      [
        { path: 'project.json', content: '{}' },
        { path: 'scenes.js', content: 'x' },
      ],
    ]

    expect(await db.readProjectFiles(41)).toEqual({ 'project.json': '{}', 'scenes.js': 'x' })
  })

  it('reads one file, or null', async () => {
    queue = [[{ content: 'x' }], []]

    expect(await db.readProjectFile(41, 'scenes.js')).toBe('x')
    expect(await db.readProjectFile(41, 'nope.js')).toBeNull()
  })

  it('upserts a file', async () => {
    queue = [[]]

    await db.saveProjectFile(41, 'scenes.js', 'R.video({})')

    const [insert] = writes('insert', 'video_files')
    expect(insert.steps.values).toEqual({ versionId: 41, path: 'scenes.js', content: 'R.video({})' })
    expect(insert.steps.onConflict.set).toEqual({ content: 'R.video({})' })
  })

  it('deletes a file and says whether it existed', async () => {
    queue = [[{ id: 1 }], []]

    expect(await db.deleteProjectFile(41, 'old.js')).toBe(true)
    expect(await db.deleteProjectFile(41, 'old.js')).toBe(false)
  })
})

describe('assets', () => {
  it('lists the assets with their sizes', async () => {
    queue = [[{ name: 'logo.svg', mimeType: 'image/svg+xml', bytes: 300 }]]

    expect(await db.listVideoAssets(VIDEO_ID)).toEqual([{ name: 'logo.svg', mimeType: 'image/svg+xml', bytes: 300 }])
  })

  it('loads the assets as the bundle expects them', async () => {
    const data = Buffer.from('<svg/>')
    queue = [[{ name: 'logo.svg', mimeType: 'image/svg+xml', data }]]

    expect(await db.loadVideoAssets(VIDEO_ID)).toEqual({ 'logo.svg': { mimeType: 'image/svg+xml', data } })
  })

  it('upserts an asset with its sha256', async () => {
    queue = [[]]

    const sha256 = await db.saveVideoAsset(VIDEO_ID, {
      name: 'a.svg',
      mimeType: 'image/svg+xml',
      data: Buffer.from('abc'),
    })

    expect(sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const [insert] = writes('insert', 'video_assets')
    expect(insert.steps.values).toMatchObject({ videoId: VIDEO_ID, name: 'a.svg', sha256 })
    expect(insert.steps.onConflict.set).toMatchObject({ mimeType: 'image/svg+xml', sha256 })
  })
})

describe('frames', () => {
  it('saves a contact sheet and trims the older ones', async () => {
    const image = Buffer.from('png')
    queue = [[{ id: 17 }], []]

    expect(await db.saveVersionFrame(41, { times: [1, 2], image })).toBe(17)
    expect(writes('insert', 'video_frames')[0].steps.values).toEqual({ versionId: 41, times: [1, 2], image })
    expect(writes('delete', 'video_frames')).toHaveLength(1)
  })

  it('reads the image of a frame of an owned video, or null', async () => {
    const image = Buffer.from('png')
    queue = [[{ image }], []]

    expect(await db.getFrameImage(VIDEO_ID, 7, 17)).toBe(image)
    expect(await db.getFrameImage(VIDEO_ID, 8, 17)).toBeNull()
  })
})
