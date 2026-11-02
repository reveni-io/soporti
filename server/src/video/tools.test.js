import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exampleProjectFixture } from './__fixtures__/example-project.js'

vi.mock('../agent/tools.js', () => ({ buildRepoTools: vi.fn(() => [{ name: 'get_file_contents' }]) }))
vi.mock('../repo-pool/index.js', () => ({ readBinaryFile: vi.fn() }))
vi.mock('../db/attachment-images.js', () => ({ getAttachmentImages: vi.fn() }))
vi.mock('../db/video-files.js', () => {
  return {
    deleteProjectFile: vi.fn(),
    listProjectFiles: vi.fn(),
    listVideoAssets: vi.fn(),
    loadVideoAssets: vi.fn(),
    readProjectFile: vi.fn(),
    readProjectFiles: vi.fn(),
    saveProjectFile: vi.fn(),
    saveVersionFrame: vi.fn(),
    saveVideoAsset: vi.fn(),
  }
})
vi.mock('./inspect.js', () => ({ inspectProject: vi.fn() }))
vi.mock('./contact-sheet.js', () => ({ captureContactSheet: vi.fn() }))

const { buildRepoTools } = await import('../agent/tools.js')
const { readBinaryFile } = await import('../repo-pool/index.js')
const { getAttachmentImages } = await import('../db/attachment-images.js')
const files = await import('../db/video-files.js')
const { inspectProject } = await import('./inspect.js')
const { captureContactSheet } = await import('./contact-sheet.js')
const { buildVideoTools, describeToolStep, runVideoCheck } = await import('./tools.js')

const KB = 1024
const MB = 1024 * KB
const IMAGE_ID = '5b0f7c3e-1d2a-4e3f-9a8b-7c6d5e4f3a2b'
const PNG = Buffer.from('png-bytes')

let ctx

function context() {
  return {
    job: {
      id: 41,
      videoId: 'video-1',
      video: {
        userId: 7,
        brief: {
          repos: ['acme/web'],
          pace: 'normal',
          attachments: [
            { name: 'shot.png', imageId: IMAGE_ID },
            { name: 'notes.pdf', text: 'Notes' },
          ],
        },
      },
    },
    reporter: { event: vi.fn() },
    state: { lastCheck: { ok: true } },
  }
}

function findTool(name) {
  return buildVideoTools(ctx).find(item => item.name === name)
}

async function invoke(name, input) {
  return findTool(name).invoke({}, JSON.stringify(input))
}

async function invokeJson(name, input) {
  return JSON.parse(await invoke(name, input))
}

function report(overrides = {}) {
  return {
    ok: true,
    errors: [],
    warnings: [],
    meta: { width: 1920, height: 1080, fps: 30, duration: 7 },
    cues: [
      { t: 0.4, type: 'open' },
      { t: 1, type: 'key' },
      { t: 1.1, type: 'key' },
    ],
    captions: [{ text: 'Made with the kit', from: 1.5, to: 6, needed: 1.83, ok: true }],
    seekMs: 1.2,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  ctx = context()
  files.listProjectFiles.mockResolvedValue([{ path: 'scenes.js', bytes: 2 * KB }])
  files.listVideoAssets.mockResolvedValue([{ name: 'logo.svg', mimeType: 'image/svg+xml', bytes: KB }])
  files.readProjectFiles.mockResolvedValue(exampleProjectFixture.files)
  files.loadVideoAssets.mockResolvedValue(exampleProjectFixture.assets)
  files.saveVersionFrame.mockResolvedValue(9)
  inspectProject.mockResolvedValue(report())
})

describe('buildVideoTools', () => {
  it('adds the repo tools restricted to the repos of the brief', () => {
    const names = buildVideoTools(ctx).map(item => item.name)

    expect(buildRepoTools).toHaveBeenCalledWith(['acme/web'])
    expect(names).toEqual([
      'get_file_contents',
      'list_project_files',
      'read_project_file',
      'write_project_file',
      'edit_project_file',
      'delete_project_file',
      'copy_repo_asset',
      'use_attachment_image',
      'check_video',
      'preview_frames',
      'report_progress',
    ])
  })
})

describe('project file tools', () => {
  it('lists the files, the assets and the limits', async () => {
    const result = await invokeJson('list_project_files', {})

    expect(files.listProjectFiles).toHaveBeenCalledWith(41)
    expect(files.listVideoAssets).toHaveBeenCalledWith('video-1')
    expect(result).toEqual({
      files: [{ path: 'scenes.js', bytes: 2 * KB }],
      assets: [{ name: 'logo.svg', mimeType: 'image/svg+xml', bytes: KB }],
      limits: { files: 40, fileBytes: 400 * KB, filesBytes: 2 * MB },
    })
  })

  it('reads a whole file, or says it does not exist', async () => {
    files.readProjectFile.mockResolvedValueOnce('R.video({})').mockResolvedValueOnce(null)

    expect(await invokeJson('read_project_file', { path: 'scenes.js' })).toEqual({
      path: 'scenes.js',
      content: 'R.video({})',
    })
    expect((await invokeJson('read_project_file', { path: 'nope.js' })).error).toContain('"nope.js" does not exist')
    expect(files.readProjectFile).toHaveBeenCalledWith(41, 'scenes.js')
  })

  it('writes a file and forgets the last check', async () => {
    const result = await invokeJson('write_project_file', { path: 'ui/table.js', content: 'const a = 1' })

    expect(result).toEqual({ path: 'ui/table.js', bytes: 11 })
    expect(files.saveProjectFile).toHaveBeenCalledTimes(1)
    expect(files.saveProjectFile).toHaveBeenCalledWith(41, 'ui/table.js', 'const a = 1')
    expect(ctx.state.lastCheck).toBeNull()
  })

  it.each([
    ['Scenes.js', 'is not a valid file path'],
    ['../scenes.js', 'is not a valid file path'],
    ['kit/core.js', 'is reserved'],
    ['assets/logo.svg', 'is reserved'],
    ['notes.md', 'unsupported extension'],
  ])('refuses to write %s', async (path, message) => {
    const result = await invokeJson('write_project_file', { path, content: 'x' })

    expect(result.error).toContain(message)
    expect(files.saveProjectFile).not.toHaveBeenCalled()
    expect(ctx.state.lastCheck).toEqual({ ok: true })
  })

  it('refuses a file over 400 KB', async () => {
    const result = await invokeJson('write_project_file', { path: 'data.js', content: 'x'.repeat(400 * KB + 1) })

    expect(result.error).toContain('a file can be at most 400 KB')
    expect(files.saveProjectFile).not.toHaveBeenCalled()
  })

  it('refuses a 41st file but lets an existing one be replaced', async () => {
    const forty = Array.from({ length: 40 }, (_, i) => ({ path: `f${i}.js`, bytes: 10 }))
    files.listProjectFiles.mockResolvedValue(forty)

    const added = await invokeJson('write_project_file', { path: 'new.js', content: 'x' })
    const replaced = await invokeJson('write_project_file', { path: 'f3.js', content: 'y' })

    expect(added.error).toBe('The project already has 40 files: delete one before adding another.')
    expect(replaced).toEqual({ path: 'f3.js', bytes: 1 })
    expect(files.saveProjectFile).toHaveBeenCalledTimes(1)
  })

  it('refuses a write that takes the project over 2 MB', async () => {
    files.listProjectFiles.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ path: `f${i}.js`, bytes: 350 * KB }))
    )

    const result = await invokeJson('write_project_file', { path: 'more.js', content: 'x'.repeat(50 * KB) })

    expect(result.error).toBe('The project files would add up to 2.1 MB: the limit is 2.0 MB.')
  })

  it('edits a file by exact replacement', async () => {
    files.readProjectFile.mockResolvedValue("const T = { open: 0.4 }\nconst COLOR = 'green'")

    const result = await invokeJson('edit_project_file', {
      path: 'data.js',
      oldString: "'green'",
      newString: "'orange'",
    })

    expect(result).toEqual({ path: 'data.js', bytes: 46 })
    expect(files.saveProjectFile).toHaveBeenCalledWith(41, 'data.js', "const T = { open: 0.4 }\nconst COLOR = 'orange'")
  })

  it('refuses an ambiguous edit unless replaceAll is set', async () => {
    files.readProjectFile.mockResolvedValue('a b a')

    const refused = await invokeJson('edit_project_file', { path: 'data.js', oldString: 'a', newString: 'c' })
    const replaced = await invokeJson('edit_project_file', {
      path: 'data.js',
      oldString: 'a',
      newString: 'c',
      replaceAll: true,
    })

    expect(refused.error).toContain('appears 2 times')
    expect(replaced).toEqual({ path: 'data.js', bytes: 5 })
    expect(files.saveProjectFile).toHaveBeenCalledWith(41, 'data.js', 'c b c')
  })

  it('explains a missing file, a missing oldString and an empty oldString', async () => {
    files.readProjectFile.mockResolvedValueOnce(null).mockResolvedValue('abc')

    const missingFile = await invokeJson('edit_project_file', { path: 'x.js', oldString: 'a', newString: 'b' })
    const notFound = await invokeJson('edit_project_file', { path: 'x.js', oldString: 'zzz', newString: 'b' })
    const empty = await invokeJson('edit_project_file', { path: 'x.js', oldString: '', newString: 'b' })

    expect(missingFile.error).toContain('Create it with write_project_file')
    expect(notFound.error).toContain('oldString was not found in "x.js"')
    expect(empty.error).toBe('oldString cannot be empty.')
    expect(files.saveProjectFile).not.toHaveBeenCalled()
  })

  it('deletes a file and forgets the last check, or says it does not exist', async () => {
    files.deleteProjectFile.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    expect(await invokeJson('delete_project_file', { path: 'old.js' })).toEqual({ deleted: 'old.js' })
    expect(ctx.state.lastCheck).toBeNull()
    expect((await invokeJson('delete_project_file', { path: 'old.js' })).error).toBe('"old.js" does not exist.')
    expect(files.deleteProjectFile).toHaveBeenCalledWith(41, 'old.js')
  })
})

describe('asset tools', () => {
  it('copies a font from a repo of the brief into the assets of the video', async () => {
    const font = Buffer.from('wOF2-font')
    readBinaryFile.mockResolvedValue(font)

    const result = await invokeJson('copy_repo_asset', {
      repo: 'acme/web',
      path: 'public/fonts/Inter-600.woff2',
      name: 'inter-600.woff2',
    })

    expect(readBinaryFile).toHaveBeenCalledWith('acme/web', 'public/fonts/Inter-600.woff2', { maxBytes: 2 * MB })
    expect(files.saveVideoAsset).toHaveBeenCalledWith('video-1', {
      name: 'inter-600.woff2',
      mimeType: 'font/woff2',
      data: font,
    })
    expect(result).toEqual({
      name: 'inter-600.woff2',
      mimeType: 'font/woff2',
      bytes: font.length,
      css: 'url("assets/inter-600.woff2")',
      js: "R.asset('inter-600.woff2')",
    })
    expect(ctx.state.lastCheck).toBeNull()
  })

  it('refuses a repo outside the brief without reading it', async () => {
    const result = await invokeJson('copy_repo_asset', { repo: 'acme/other', path: 'logo.svg', name: 'logo.svg' })

    expect(result.error).toBe('"acme/other" is not a repository of this brief: use acme/web.')
    expect(readBinaryFile).not.toHaveBeenCalled()
  })

  it('passes on why the repo file could not be read', async () => {
    readBinaryFile.mockRejectedValue(new Error('Access to ".env" is not allowed.'))

    const result = await invokeJson('copy_repo_asset', { repo: 'acme/web', path: '.env', name: 'env.svg' })

    expect(result.error).toBe('Access to ".env" is not allowed.')
    expect(files.saveVideoAsset).not.toHaveBeenCalled()
  })

  it.each([
    ['Logo.svg', 'is not a valid asset name'],
    ['logo.exe', 'is not a font'],
  ])('refuses the asset name %s', async (name, message) => {
    readBinaryFile.mockResolvedValue(Buffer.from('x'))

    const result = await invokeJson('copy_repo_asset', { repo: 'acme/web', path: 'logo.svg', name })

    expect(result.error).toContain(message)
    expect(files.saveVideoAsset).not.toHaveBeenCalled()
  })

  it('refuses an asset that takes the video over 15 MB', async () => {
    files.listVideoAssets.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ name: `a${i}.png`, bytes: 2 * MB })))
    readBinaryFile.mockResolvedValue(Buffer.alloc(MB))

    const result = await invokeJson('copy_repo_asset', { repo: 'acme/web', path: 'hero.png', name: 'hero.png' })

    expect(result.error).toBe('The assets would add up to 17.0 MB: the limit is 15.0 MB per video.')
    expect(files.saveVideoAsset).not.toHaveBeenCalled()
  })

  it('adds an image attached to the brief', async () => {
    getAttachmentImages.mockResolvedValue(new Map([[IMAGE_ID, `data:image/png;base64,${PNG.toString('base64')}`]]))

    const result = await invokeJson('use_attachment_image', { imageId: IMAGE_ID, name: 'screenshot.png' })

    expect(getAttachmentImages).toHaveBeenCalledWith([IMAGE_ID], 7)
    expect(files.saveVideoAsset).toHaveBeenCalledWith('video-1', {
      name: 'screenshot.png',
      mimeType: 'image/png',
      data: PNG,
    })
    expect(result.css).toBe('url("assets/screenshot.png")')
  })

  it('refuses an image that is not attached, gone or named with the wrong extension', async () => {
    getAttachmentImages
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([[IMAGE_ID, `data:image/png;base64,${PNG.toString('base64')}`]]))

    const foreign = await invokeJson('use_attachment_image', {
      imageId: '00000000-0000-4000-8000-000000000000',
      name: 'x.png',
    })
    const gone = await invokeJson('use_attachment_image', { imageId: IMAGE_ID, name: 'x.png' })
    const mismatch = await invokeJson('use_attachment_image', { imageId: IMAGE_ID, name: 'x.jpg' })

    expect(foreign.error).toBe('That image is not attached to the brief.')
    expect(gone.error).toBe('That image is no longer available.')
    expect(mismatch.error).toBe('The image is image/png: give the asset name the matching extension.')
    expect(files.saveVideoAsset).not.toHaveBeenCalled()
  })
})

describe('check_video', () => {
  it("bundles the project, inspects it at the brief's pace and summarizes the cues", async () => {
    ctx.state.lastCheck = null

    const result = await invokeJson('check_video', {})

    expect(inspectProject).toHaveBeenCalledTimes(1)
    const { html, pace } = inspectProject.mock.calls[0][0]
    expect(pace).toBe('normal')
    expect(html).toContain('window.__MODE__ = "render"')
    expect(html).toContain('data:image/svg+xml;base64,')
    expect(result).toEqual({
      ok: true,
      errors: [],
      warnings: [],
      meta: { width: 1920, height: 1080, fps: 30, duration: 7 },
      cues: { total: 3, byType: { open: 1, key: 2 } },
      captions: [{ text: 'Made with the kit', from: 1.5, to: 6, needed: 1.83, ok: true }],
      seekMs: 1.2,
    })
    expect(ctx.state.lastCheck.ok).toBe(true)
  })

  it('reports a project that cannot be bundled without opening a browser', async () => {
    files.readProjectFiles.mockResolvedValue({ 'scenes.js': 'R.video({})' })

    const result = await runVideoCheck(ctx)

    expect(inspectProject).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('project.json is missing')
    expect(ctx.state.lastCheck).toBe(result)
  })

  it('lets an unexpected error through', async () => {
    inspectProject.mockRejectedValue(new Error('Chromium crashed'))

    await expect(runVideoCheck(ctx)).rejects.toThrow('Chromium crashed')
  })
})

describe('preview_frames', () => {
  it('returns the contact sheet as an image next to its times and saves it', async () => {
    captureContactSheet.mockResolvedValue({ png: PNG, errors: [] })

    const result = await invoke('preview_frames', { times: [2, 9, 15], columns: 3 })

    expect(captureContactSheet).toHaveBeenCalledWith({
      html: expect.stringContaining('<!doctype html>'),
      times: [2, 9, 15],
      columns: 3,
    })
    expect(files.saveVersionFrame).toHaveBeenCalledWith(41, { times: [2, 9, 15], image: PNG })
    expect(result).toEqual([
      { type: 'text', text: JSON.stringify({ frameId: 9, times: [2, 9, 15], errors: [] }) },
      { type: 'image', image: `data:image/png;base64,${PNG.toString('base64')}` },
    ])
  })

  it('uses four columns by default', async () => {
    captureContactSheet.mockResolvedValue({ png: PNG, errors: [] })

    await invoke('preview_frames', { times: [1] })

    expect(captureContactSheet.mock.calls[0][0].columns).toBe(4)
  })

  it('reports the errors when no frame could be drawn', async () => {
    captureContactSheet.mockResolvedValue({ png: null, errors: ['ReferenceError: x is not defined'] })

    const result = JSON.parse(await invoke('preview_frames', { times: [1] }))

    expect(result.error).toBe('No frame could be drawn. ReferenceError: x is not defined')
    expect(files.saveVersionFrame).not.toHaveBeenCalled()
  })

  it('reports a project that cannot be bundled', async () => {
    files.readProjectFiles.mockResolvedValue({})

    const result = JSON.parse(await invoke('preview_frames', { times: [1] }))

    expect(result.error).toContain('project.json is missing')
    expect(captureContactSheet).not.toHaveBeenCalled()
  })
})

describe('report_progress', () => {
  it('adds the note to the events of the version', async () => {
    const result = await invoke('report_progress', { note: 'Copied the brand fonts.' })

    expect(result).toBe('Shown to the user.')
    expect(ctx.reporter.event).toHaveBeenCalledTimes(1)
    expect(ctx.reporter.event).toHaveBeenCalledWith('Copied the brand fonts.')
  })
})

describe('describeToolStep', () => {
  it.each([
    ['write_project_file', { path: 'scenes.js' }, 'Writing scenes.js'],
    ['edit_project_file', { path: 'data.js' }, 'Editing data.js'],
    ['read_project_file', { path: 'ui.js' }, 'Reading ui.js'],
    ['delete_project_file', { path: 'old.js' }, 'Deleting old.js'],
    ['list_project_files', {}, 'Listing the project files'],
    ['check_video', {}, 'Checking the page'],
    ['preview_frames', { times: [2, 9.4, 75] }, 'Reviewing frames at 0:02, 0:09, 1:15'],
    ['copy_repo_asset', { repo: 'acme/web', name: 'logo.svg' }, 'Copying logo.svg from acme/web'],
    ['use_attachment_image', { name: 'shot.png' }, 'Adding the image shot.png'],
    ['report_progress', { note: 'Fonts copied' }, 'Fonts copied'],
    ['get_directory_contents', { repo: 'acme/web' }, 'Exploring acme/web'],
    ['get_file_contents', { repo: 'acme/web', path: 'src/App.jsx' }, 'Reading src/App.jsx in acme/web'],
    ['search_code', { repo: 'acme/web', query: '--primary' }, 'Searching acme/web for "--primary"'],
    ['find_files', { repo: 'acme/web', pattern: '*.woff2' }, 'Looking for *.woff2 in acme/web'],
    ['git_log_file', { path: 'a.js' }, 'Reading the history of a.js'],
    ['git_blame', { path: 'a.js' }, 'Reading the history of a.js'],
  ])('describes %s', (name, input, expected) => {
    expect(describeToolStep(name, JSON.stringify(input))).toBe(expected)
  })

  it('falls back to the tool name for unknown tools and unreadable arguments', () => {
    expect(describeToolStep('mystery', '{}')).toBe('Running mystery')
    expect(describeToolStep('write_project_file', '{oops')).toBe('Running write_project_file')
    expect(describeToolStep('list_project_files', undefined)).toBe('Listing the project files')
  })
})
