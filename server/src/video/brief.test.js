import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../github/client.js', () => ({ listRepos: vi.fn() }))
vi.mock('../db/attachment-images.js', () => ({ findOwnedAttachmentImageIds: vi.fn() }))

const { listRepos } = await import('../github/client.js')
const { findOwnedAttachmentImageIds } = await import('../db/attachment-images.js')
const { parseBrief, briefTitle } = await import('./brief.js')

const IMAGE_ID = '11111111-1111-4111-8111-111111111111'

function validBrief(overrides = {}) {
  return {
    idea: 'How a merchant refunds an order in one click',
    repos: ['reveni/dashboard'],
    path: null,
    audience: 'merchants',
    language: 'es',
    format: '16:9',
    durationSeconds: 30,
    pace: 'relaxed',
    attachments: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  listRepos.mockResolvedValue([{ fullName: 'reveni/dashboard' }, { fullName: 'reveni/api' }])
  findOwnedAttachmentImageIds.mockResolvedValue(new Set())
})

describe('parseBrief', () => {
  it('returns the parsed brief', async () => {
    const result = await parseBrief(validBrief({ repos: [' reveni/dashboard ', 'reveni/api'] }), 7)

    expect(result).toEqual({ value: validBrief({ repos: ['reveni/dashboard', 'reveni/api'] }) })
  })

  it('requires a brief object', async () => {
    expect(await parseBrief(null, 7)).toEqual({ error: 'A "brief" object is required.' })
    expect(await parseBrief(['idea'], 7)).toEqual({ error: 'A "brief" object is required.' })
  })

  it('requires an idea of at most 4000 characters', async () => {
    expect((await parseBrief(validBrief({ idea: '   ' }), 7)).error).toBe('Describe the idea of the video.')
    expect((await parseBrief(validBrief({ idea: 'a'.repeat(4001) }), 7)).error).toMatch(/too long/)
  })

  it('requires between one and five repos', async () => {
    expect((await parseBrief(validBrief({ repos: [] }), 7)).error).toBe('Pick at least one repo.')
    expect((await parseBrief(validBrief({ repos: 'reveni/api' }), 7)).error).toBe('Pick at least one repo.')
    expect((await parseBrief(validBrief({ repos: ['a/1', 'a/2', 'a/3', 'a/4', 'a/5', 'a/6'] }), 7)).error).toBe(
      'Pick at most 5 repos.'
    )
  })

  it('rejects a repo that is not in the catalog', async () => {
    const result = await parseBrief(validBrief({ repos: ['reveni/dashboard', 'reveni/secret'] }), 7)

    expect(result).toEqual({ error: 'The repo reveni/secret is not available.' })
  })

  it('rejects a repo entry that is not a string', async () => {
    expect((await parseBrief(validBrief({ repos: [42] }), 7)).error).toBe('The repo (empty) is not available.')
  })

  it('trims the slashes around the folder and treats an empty one as none', async () => {
    expect((await parseBrief(validBrief({ path: '/apps/dashboard/src/' }), 7)).value.path).toBe('apps/dashboard/src')
    expect((await parseBrief(validBrief({ path: '  ' }), 7)).value.path).toBeNull()
    expect((await parseBrief(validBrief({ path: undefined }), 7)).value.path).toBeNull()
  })

  it('rejects a folder that leaves the repo or is not a path', async () => {
    const error = 'The folder must be a path inside the repo, like "apps/dashboard/src".'

    expect((await parseBrief(validBrief({ path: 'apps/../../etc' }), 7)).error).toBe(error)
    expect((await parseBrief(validBrief({ path: 'apps dashboard' }), 7)).error).toBe(error)
    expect((await parseBrief(validBrief({ path: 42 }), 7)).error).toBe('The folder must be a path inside the repo.')
  })

  it.each([
    ['audience', 'investors', '"audience" must be one of: merchants, internal, sales, developers.'],
    ['language', 'fr', '"language" must be one of: en, es.'],
    ['format', '4:3', '"format" must be one of: 16:9, 1:1, 9:16.'],
    ['durationSeconds', 45, '"durationSeconds" must be one of: 20, 30, 60, 90.'],
    ['pace', undefined, '"pace" must be one of: relaxed, normal, fast.'],
  ])('rejects an unknown %s', async (field, value, error) => {
    expect(await parseBrief(validBrief({ [field]: value }), 7)).toEqual({ error })
  })

  it('keeps document attachments truncated to 20000 characters', async () => {
    const result = await parseBrief(validBrief({ attachments: [{ name: 'spec.pdf', text: 'x'.repeat(25_000) }] }), 7)

    expect(result.value.attachments).toEqual([{ name: 'spec.pdf', text: 'x'.repeat(20_000) }])
  })

  it('keeps image attachments the user owns', async () => {
    findOwnedAttachmentImageIds.mockResolvedValue(new Set([IMAGE_ID]))

    const result = await parseBrief(validBrief({ attachments: [{ name: 'screen.png', imageId: IMAGE_ID }] }), 7)

    expect(result.value.attachments).toEqual([{ name: 'screen.png', imageId: IMAGE_ID }])
    expect(findOwnedAttachmentImageIds).toHaveBeenCalledTimes(1)
    expect(findOwnedAttachmentImageIds).toHaveBeenCalledWith([IMAGE_ID], 7)
  })

  it('rejects an image the user does not own or that expired', async () => {
    const result = await parseBrief(validBrief({ attachments: [{ name: 'screen.png', imageId: IMAGE_ID }] }), 7)

    expect(result).toEqual({ error: 'The image "screen.png" is no longer available. Attach it again.' })
  })

  it('rejects malformed attachments', async () => {
    expect((await parseBrief(validBrief({ attachments: 'spec.pdf' }), 7)).error).toBe('Attachments must be a list.')
    expect((await parseBrief(validBrief({ attachments: [{ text: 'hi' }] }), 7)).error).toBe(
      'Each attachment needs a valid file name.'
    )
    expect((await parseBrief(validBrief({ attachments: [{ name: 'a.png', imageId: 'nope' }] }), 7)).error).toBe(
      '"a.png" has an invalid image ID.'
    )
    expect((await parseBrief(validBrief({ attachments: [{ name: 'a.pdf' }] }), 7)).error).toBe(
      '"a.pdf" needs its extracted text or an image ID.'
    )
  })

  it('accepts at most five attachments and defaults to none', async () => {
    const attachments = Array.from({ length: 6 }, (_, index) => ({ name: `doc${index}.txt`, text: 'hi' }))

    expect((await parseBrief(validBrief({ attachments }), 7)).error).toBe('Attach at most 5 files.')
    expect((await parseBrief(validBrief({ attachments: undefined }), 7)).value.attachments).toEqual([])
  })

  it('does not call GitHub when a field is already invalid', async () => {
    await parseBrief(validBrief({ format: '4:3' }), 7)

    expect(listRepos).not.toHaveBeenCalled()
  })
})

describe('briefTitle', () => {
  it('uses the first line of the idea', () => {
    expect(briefTitle({ idea: 'Refunds in one click\nFor merchants on Shopify' })).toBe('Refunds in one click')
  })

  it('cuts a long first line with an ellipsis', () => {
    const title = briefTitle({ idea: `${'word '.repeat(30)}end` })

    expect(title).toHaveLength(80)
    expect(title.endsWith('…')).toBe(true)
  })
})
