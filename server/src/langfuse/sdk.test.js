import { describe, it, expect, vi, beforeEach } from 'vitest'

const promptGet = vi.fn()
const listItems = vi.fn()
const createRunItem = vi.fn()
const LangfuseClient = vi.fn(function LangfuseClient(params) {
  this.params = params
  this.prompt = { get: promptGet }
  this.api = { datasetItems: { list: listItems }, datasetRunItems: { create: createRunItem } }
})
vi.mock('@langfuse/client', () => ({ LangfuseClient }))

const configureGlobalLogger = vi.fn()
vi.mock('@langfuse/core', () => ({ configureGlobalLogger, LogLevel: { NONE: 4 } }))

const {
  createLangfuseClient,
  describeError,
  fetchExperimentPrompt,
  linkDatasetRunItem,
  isLangfuseNotFound,
  listDatasetItems,
  EXPERIMENT_PROMPT_NAME,
} = await import('./sdk.js')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createLangfuseClient', () => {
  it('builds a client for the stored host and keys and silences the SDK logger', () => {
    const client = createLangfuseClient({ publicKey: 'pk-lf-1', secretKey: 'sk-lf-1', host: 'https://lf.example' })

    expect(client.params).toEqual({ publicKey: 'pk-lf-1', secretKey: 'sk-lf-1', baseUrl: 'https://lf.example' })
    expect(configureGlobalLogger).toHaveBeenCalledWith({ level: 4 })
  })
})

describe('fetchExperimentPrompt', () => {
  it('reads the label uncached and returns its version and config', async () => {
    promptGet.mockResolvedValue({ version: 7, config: { sections: { core_intro: 'x' } } })

    const prompt = await fetchExperimentPrompt(createLangfuseClient({}), { label: 'compact' })

    expect(prompt).toEqual({ version: 7, config: { sections: { core_intro: 'x' } } })
    expect(promptGet).toHaveBeenCalledWith(
      EXPERIMENT_PROMPT_NAME,
      expect.objectContaining({ label: 'compact', version: undefined, type: 'text', cacheTtlSeconds: 0 })
    )
  })

  it('treats a missing config as none', async () => {
    promptGet.mockResolvedValue({ version: 2 })

    expect(await fetchExperimentPrompt(createLangfuseClient({}), { version: 2 })).toEqual({ version: 2, config: null })
  })
})

describe('listDatasetItems', () => {
  it.each([
    { totalPages: 1, hasMorePages: false },
    { totalPages: 3, hasMorePages: true },
  ])('reports more pages when the dataset spans $totalPages page(s)', async ({ totalPages, hasMorePages }) => {
    listItems.mockResolvedValue({ data: [{ id: 'item-1' }], meta: { totalPages } })

    const listed = await listDatasetItems(createLangfuseClient({}), 'support-questions')

    expect(listed).toEqual({ items: [{ id: 'item-1' }], hasMorePages })
    expect(listItems).toHaveBeenCalledWith(
      expect.objectContaining({ datasetName: 'support-questions' }),
      expect.anything()
    )
  })
})

describe('listDatasetItems on an empty page', () => {
  it('reads a page without data or meta as one empty page', async () => {
    listItems.mockResolvedValue({})

    expect(await listDatasetItems(createLangfuseClient({}), 'support-questions')).toEqual({
      items: [],
      hasMorePages: false,
    })
  })
})

describe('linkDatasetRunItem', () => {
  it('links the trace to the run without retrying the write', async () => {
    const link = { runName: 'r [compact] t', datasetItemId: 'item-1', traceId: 'abc', metadata: { variant: 'compact' } }

    await linkDatasetRunItem(createLangfuseClient({}), link)

    expect(createRunItem).toHaveBeenCalledWith(link, expect.objectContaining({ maxRetries: 0 }))
  })
})

describe('describeError', () => {
  it.each([
    { err: Object.assign(new TypeError('boom'), { statusCode: 503 }), described: 'TypeError 503' },
    { err: new Error('body with secrets'), described: 'Error' },
    { err: null, described: 'Error' },
    { err: Object.assign(new Error('Agent run exceeded 1 ms.'), { name: 'TimeoutError' }), described: 'TimeoutError' },
    {
      err: Object.assign(new (class LangfuseAPIError extends Error {})('x'), { statusCode: 404 }),
      described: 'LangfuseAPIError 404',
    },
  ])('names the error as "$described" without its message', ({ err, described }) => {
    expect(describeError(err)).toBe(described)
  })
})

describe('isLangfuseNotFound', () => {
  it.each([
    { err: { statusCode: 404 }, notFound: true },
    { err: { statusCode: 500 }, notFound: false },
    { err: new Error('network'), notFound: false },
    { err: null, notFound: false },
  ])('says $notFound for $err', ({ err, notFound }) => {
    expect(isLangfuseNotFound(err)).toBe(notFound)
  })
})
