import { describe, it, expect, vi, beforeEach } from 'vitest'

const getFigmaToken = vi.fn(async () => 'figd_test_token')
const isFigmaConfigured = vi.fn(async () => true)
vi.mock('./settings.js', () => ({ getFigmaToken, isFigmaConfigured }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const {
  parseFigmaReference,
  normalizeNodeId,
  buildFigmaUrl,
  getFile,
  getNode,
  renderNode,
  listComments,
  postComment,
  isConfigured,
} = await import('./client.js')

const FILE_URL = 'https://www.figma.com/design/AbCdEf123456/Checkout?node-id=12-345&t=xyz'

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) }
}

beforeEach(() => {
  mockFetch.mockReset()
  getFigmaToken.mockReset().mockResolvedValue('figd_test_token')
})

describe('parseFigmaReference', () => {
  it('extracts the file key and the node id from a design URL', () => {
    expect(parseFigmaReference(FILE_URL)).toEqual({ fileKey: 'AbCdEf123456', nodeId: '12:345' })
  })

  it('accepts file, proto and board links, with or without a protocol', () => {
    expect(parseFigmaReference('https://www.figma.com/file/Key1234567890/Name')).toEqual({
      fileKey: 'Key1234567890',
      nodeId: null,
    })
    expect(parseFigmaReference('figma.com/proto/Key1234567890/Name?node-id=1%3A2')).toEqual({
      fileKey: 'Key1234567890',
      nodeId: '1:2',
    })
    expect(parseFigmaReference('https://www.figma.com/board/Key1234567890/Board')).toEqual({
      fileKey: 'Key1234567890',
      nodeId: null,
    })
  })

  it('accepts a bare file key', () => {
    expect(parseFigmaReference('  AbCdEf123456  ')).toEqual({ fileKey: 'AbCdEf123456', nodeId: null })
  })

  it('rejects empty and unrecognised values', () => {
    expect(() => parseFigmaReference('  ')).toThrow('A Figma file URL or file key is required.')
    expect(() => parseFigmaReference('https://example.com/design/abc')).toThrow('neither a Figma file URL')
    expect(() => parseFigmaReference('short')).toThrow('neither a Figma file URL')
  })
})

describe('normalizeNodeId', () => {
  it('turns the dashed URL form into the API form', () => {
    expect(normalizeNodeId('12-345')).toBe('12:345')
    expect(normalizeNodeId('I12-345;6-7')).toBe('I12:345;6:7')
  })

  it('leaves API ids and other values alone', () => {
    expect(normalizeNodeId('12:345')).toBe('12:345')
    expect(normalizeNodeId(' 0:1 ')).toBe('0:1')
  })
})

describe('buildFigmaUrl', () => {
  it('links to the file, and to a node with the dashed id', () => {
    expect(buildFigmaUrl('Key1234567890')).toBe('https://www.figma.com/design/Key1234567890')
    expect(buildFigmaUrl('Key1234567890', '12:345')).toBe('https://www.figma.com/design/Key1234567890?node-id=12-345')
  })
})

describe('request handling', () => {
  it('sends the personal access token header', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ name: 'File', document: { children: [] } }))

    await getFile('Key1234567890')

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.figma.com/v1/files/Key1234567890?depth=2')
    expect(options.method).toBe('GET')
    expect(options.headers['X-Figma-Token']).toBe('figd_test_token')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('fails with a configuration hint when there is no token', async () => {
    getFigmaToken.mockResolvedValue(null)

    await expect(getFile('Key1234567890')).rejects.toThrow('Figma is not configured')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('surfaces the API status and body on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ status: 403, err: 'Invalid token' }, { ok: false, status: 403 }))

    await expect(getFile('Key1234567890')).rejects.toThrow(
      'Figma API GET /files/Key1234567890?depth=2 failed (403): {"status":403,"err":"Invalid token"}'
    )
  })
})

describe('getFile', () => {
  it('summarises the pages and their top-level frames', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        name: 'Checkout',
        lastModified: '2026-09-01T10:00:00Z',
        document: {
          children: [
            {
              id: '0:1',
              name: 'Screens',
              type: 'CANVAS',
              children: [
                { id: '1:2', name: 'Cart', type: 'FRAME', absoluteBoundingBox: { width: 375.4, height: 812 } },
                { id: '1:3', name: 'Note', type: 'TEXT' },
              ],
            },
            { id: '0:9', name: 'Stray', type: 'SECTION', children: [] },
          ],
        },
      })
    )

    const file = await getFile(FILE_URL)

    expect(file).toEqual({
      fileKey: 'AbCdEf123456',
      name: 'Checkout',
      url: 'https://www.figma.com/design/AbCdEf123456',
      lastModified: '2026-09-01T10:00:00Z',
      pages: [
        {
          id: '0:1',
          name: 'Screens',
          frameCount: 2,
          frames: [
            { id: '1:2', name: 'Cart', type: 'FRAME', size: { width: 375, height: 812 } },
            { id: '1:3', name: 'Note', type: 'TEXT', size: undefined },
          ],
        },
      ],
    })
  })

  it('copes with an empty document', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ name: 'Empty' }))

    const file = await getFile('Key1234567890')

    expect(file.pages).toEqual([])
    expect(file.lastModified).toBeNull()
  })
})

describe('getNode', () => {
  it('reads the node carried by the URL and summarises its layers', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        name: 'Checkout',
        nodes: {
          '12:345': {
            components: { 'c:1': { name: 'Button / Primary' } },
            document: {
              id: '12:345',
              name: 'Cart',
              type: 'FRAME',
              absoluteBoundingBox: { width: 375, height: 812 },
              layoutMode: 'VERTICAL',
              cornerRadius: 12,
              fills: [
                { type: 'SOLID', visible: false, color: { r: 0, g: 0, b: 0 } },
                { type: 'SOLID', color: { r: 1, g: 1, b: 1 } },
                { type: 'IMAGE' },
              ],
              children: [
                {
                  id: '12:346',
                  name: 'Title',
                  type: 'TEXT',
                  characters: 'Your cart',
                  style: { fontFamily: 'Inter', fontWeight: 600, fontSize: 20, textAlignHorizontal: 'LEFT' },
                  fills: [{ type: 'SOLID', color: { r: 0.0157, g: 0.1451, b: 0.0118 }, opacity: 0.8 }],
                },
                { id: '12:347', name: 'Pay', type: 'INSTANCE', componentId: 'c:1', visible: false },
              ],
            },
          },
        },
      })
    )

    const result = await getNode(FILE_URL, null, 3)

    expect(mockFetch.mock.calls[0][0]).toBe('https://api.figma.com/v1/files/AbCdEf123456/nodes?ids=12%3A345&depth=3')
    expect(result).toEqual({
      fileKey: 'AbCdEf123456',
      fileName: 'Checkout',
      nodeId: '12:345',
      url: 'https://www.figma.com/design/AbCdEf123456?node-id=12-345',
      nodeCount: 3,
      truncated: false,
      node: {
        id: '12:345',
        name: 'Cart',
        type: 'FRAME',
        size: { width: 375, height: 812 },
        fills: ['#ffffff', 'image'],
        cornerRadius: 12,
        layout: 'column',
        children: [
          {
            id: '12:346',
            name: 'Title',
            type: 'TEXT',
            text: 'Your cart',
            font: 'Inter 600 20px',
            align: 'left',
            fills: ['#042503 @ 80%'],
          },
          { id: '12:347', name: 'Pay', type: 'INSTANCE', component: 'Button / Primary', hidden: true },
        ],
      },
    })
  })

  it('prefers an explicit node id and passes the depth through', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ nodes: { '7:8': { document: { id: '7:8', name: 'Modal', type: 'FRAME' } } } })
    )

    const result = await getNode(FILE_URL, '7-8', 5)

    expect(mockFetch.mock.calls[0][0]).toBe('https://api.figma.com/v1/files/AbCdEf123456/nodes?ids=7%3A8&depth=5')
    expect(result.nodeId).toBe('7:8')
    expect(result.fileName).toBeNull()
    expect(result.node).toEqual({ id: '7:8', name: 'Modal', type: 'FRAME' })
  })

  it('truncates a very large tree and reports it', async () => {
    const leaves = Array.from({ length: 400 }, (_, index) => ({
      id: `1:${index}`,
      name: `Leaf ${index}`,
      type: 'RECTANGLE',
    }))
    mockFetch.mockResolvedValue(
      jsonResponse({
        nodes: {
          '1:0': {
            document: {
              id: '1:0',
              name: 'Root',
              type: 'FRAME',
              children: [
                { id: '2:0', name: 'Group A', type: 'GROUP', children: leaves },
                { id: '3:0', name: 'Group B', type: 'GROUP', children: leaves },
              ],
            },
          },
        },
      })
    )

    const result = await getNode('Key1234567890', '1:0', 3)

    expect(result.truncated).toBe(true)
    expect(result.node.children).toHaveLength(2)
    expect(result.node.children[1].children).toBeUndefined()
    expect(result.node.children[1].childCount).toBe(400)
  })

  it('truncates a long text', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        nodes: { '1:0': { document: { id: '1:0', name: 'Body', type: 'TEXT', characters: 'a'.repeat(600) } } },
      })
    )

    const result = await getNode('Key1234567890', '1:0', 3)

    expect(result.node.text).toHaveLength(501)
    expect(result.node.text.endsWith('…')).toBe(true)
  })

  it('requires a node id from somewhere', async () => {
    await expect(getNode('Key1234567890', null, 3)).rejects.toThrow('A node id is required')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fails when the node is not in the file', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ nodes: { '1:0': null } }))

    await expect(getNode('Key1234567890', '1:0', 3)).rejects.toThrow(
      'Node "1:0" was not found in Figma file "Key1234567890".'
    )
  })
})

describe('renderNode', () => {
  it('exports the node as a png and returns the render link', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ err: null, images: { '12:345': 'https://s3.example/render.png' } }))

    const result = await renderNode(FILE_URL, null, 1)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.figma.com/v1/images/AbCdEf123456?ids=12%3A345&format=png&scale=1'
    )
    expect(result).toEqual({
      fileKey: 'AbCdEf123456',
      nodeId: '12:345',
      url: 'https://www.figma.com/design/AbCdEf123456?node-id=12-345',
      imageUrl: 'https://s3.example/render.png',
      scale: 1,
    })
  })

  it('prefers an explicit node id and passes the scale through', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ images: { '1:2': 'https://s3.example/render.png' } }))

    const result = await renderNode('Key1234567890', '1-2', 0.5)

    expect(mockFetch.mock.calls[0][0]).toContain('ids=1%3A2&format=png&scale=0.5')
    expect(result.nodeId).toBe('1:2')
    expect(result.scale).toBe(0.5)
  })

  it('fails when Figma could not render the node', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ err: 'Node not found', images: { '1:2': null } }))

    await expect(renderNode('Key1234567890', '1:2', 1)).rejects.toThrow(
      'Figma could not render node "1:2": Node not found'
    )
  })

  it('fails without an error detail when Figma gives none', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ images: {} }))

    await expect(renderNode('Key1234567890', '1:2', 1)).rejects.toThrow('Figma could not render node "1:2".')
  })
})

describe('listComments', () => {
  it('returns the comments oldest first in a compact shape', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        comments: [
          {
            id: 'c2',
            message: 'Agreed',
            user: { handle: 'ana' },
            created_at: '2026-09-02T00:00:00Z',
            resolved_at: null,
            parent_id: 'c1',
            client_meta: null,
          },
          {
            id: 'c1',
            message: 'Button too small',
            user: { handle: 'sergio' },
            created_at: '2026-09-01T00:00:00Z',
            resolved_at: '2026-09-03T00:00:00Z',
            parent_id: '',
            client_meta: { node_id: '12:345', node_offset: { x: 1, y: 2 } },
          },
        ],
      })
    )

    const result = await listComments(FILE_URL)

    expect(mockFetch.mock.calls[0][0]).toBe('https://api.figma.com/v1/files/AbCdEf123456/comments')
    expect(result).toEqual({
      fileKey: 'AbCdEf123456',
      url: 'https://www.figma.com/design/AbCdEf123456',
      total: 2,
      comments: [
        {
          id: 'c1',
          message: 'Button too small',
          author: 'sergio',
          createdAt: '2026-09-01T00:00:00Z',
          resolvedAt: '2026-09-03T00:00:00Z',
          nodeId: '12:345',
          replyTo: null,
        },
        {
          id: 'c2',
          message: 'Agreed',
          author: 'ana',
          createdAt: '2026-09-02T00:00:00Z',
          resolvedAt: null,
          nodeId: null,
          replyTo: 'c1',
        },
      ],
    })
  })

  it('caps the list while reporting the full count', async () => {
    const comments = Array.from({ length: 120 }, (_, index) => ({
      id: `c${index}`,
      message: `Comment ${index}`,
      created_at: `2026-01-01T00:00:${String(index % 60).padStart(2, '0')}Z`,
    }))
    mockFetch.mockResolvedValue(jsonResponse({ comments }))

    const result = await listComments('Key1234567890')

    expect(result.total).toBe(120)
    expect(result.comments).toHaveLength(100)
    expect(result.comments[0].author).toBeNull()
  })

  it('copes with a file without comments', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))

    expect(await listComments('Key1234567890')).toEqual({
      fileKey: 'Key1234567890',
      url: 'https://www.figma.com/design/Key1234567890',
      total: 0,
      comments: [],
    })
  })
})

describe('postComment', () => {
  it('pins a new comment to the node carried by the URL', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 'c9',
        message: 'From Ana via Soporti: please enlarge the button',
        user: { handle: 'soporti-bot' },
        created_at: '2026-09-10T00:00:00Z',
        client_meta: { node_id: '12:345', node_offset: { x: 0, y: 0 } },
      })
    )

    const result = await postComment(FILE_URL, { message: '  From Ana via Soporti: please enlarge the button  ' })

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.figma.com/v1/files/AbCdEf123456/comments')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({
      message: 'From Ana via Soporti: please enlarge the button',
      client_meta: { node_id: '12:345', node_offset: { x: 0, y: 0 } },
    })
    expect(result).toEqual({
      id: 'c9',
      message: 'From Ana via Soporti: please enlarge the button',
      author: 'soporti-bot',
      createdAt: '2026-09-10T00:00:00Z',
      resolvedAt: null,
      nodeId: '12:345',
      replyTo: null,
      fileKey: 'AbCdEf123456',
      url: 'https://www.figma.com/design/AbCdEf123456?node-id=12-345',
    })
  })

  it('replies inside a thread without pinning', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 'c10', message: 'Done', parent_id: 'c1' }))

    const result = await postComment('Key1234567890', { message: 'Done', nodeId: '1-2', replyTo: 'c1' })

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ message: 'Done', comment_id: 'c1' })
    expect(result.replyTo).toBe('c1')
    expect(result.url).toBe('https://www.figma.com/design/Key1234567890?node-id=1-2')
  })

  it('posts an unpinned comment when there is no node at all', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 'c11', message: 'Hi' }))

    const result = await postComment('Key1234567890', { message: 'Hi' })

    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ message: 'Hi' })
    expect(result.url).toBe('https://www.figma.com/design/Key1234567890')
  })

  it('refuses an empty message before calling the API', async () => {
    await expect(postComment('Key1234567890', { message: '   ' })).rejects.toThrow('A comment message is required.')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('isConfigured', () => {
  it('delegates to the settings', async () => {
    isFigmaConfigured.mockResolvedValueOnce(true)
    expect(await isConfigured()).toBe(true)

    isFigmaConfigured.mockResolvedValueOnce(false)
    expect(await isConfigured()).toBe(false)
  })
})
