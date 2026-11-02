import { extname } from 'node:path'
import { z } from 'zod'
import { tool } from '@openai/agents'
import { buildRepoTools } from '../agent/tools.js'
import { readBinaryFile } from '../repo-pool/index.js'
import { getAttachmentImages } from '../db/attachment-images.js'
import {
  deleteProjectFile,
  listProjectFiles,
  listVideoAssets,
  loadVideoAssets,
  readProjectFile,
  readProjectFiles,
  saveProjectFile,
  saveVersionFrame,
  saveVideoAsset,
} from '../db/video-files.js'
import {
  ASSET_MIME_TYPES,
  MAX_ASSET_BYTES,
  MAX_ASSETS_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_FILES_BYTES,
  bundleProject,
  describePathProblem,
  formatSize,
  validateAsset,
} from './bundle.js'
import { inspectProject } from './inspect.js'
import { captureContactSheet } from './contact-sheet.js'
import { loadKit } from './kit.js'
import { formatClock } from './progress.js'
import { VideoProjectError } from './project-error.js'

const MAX_SHEET_TIMES = 24
const MAX_SHEET_COLUMNS = 6
const DEFAULT_SHEET_COLUMNS = 4
const MAX_NOTE_LENGTH = 200
const DATA_URI_RE = /^data:([^;,]+);base64,(.*)$/s

const PATH_PARAM = z.string().describe('Project file path, e.g. "scenes.js" or "ui/table.js".')
const ASSET_NAME_PARAM = z
  .string()
  .describe('Asset name with its extension, lowercase, e.g. "inter-600.woff2" or "logo.svg".')

function json(value) {
  return JSON.stringify(value)
}

function errorResult(message) {
  return json({ error: message })
}

function sumBytes(items) {
  return items.reduce((total, item) => total + item.bytes, 0)
}

async function guarded(run) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof VideoProjectError) return errorResult(error.message)
    throw error
  }
}

async function findFileWriteProblem(versionId, path, content) {
  const problem = describePathProblem(path)
  if (problem) return problem

  const bytes = Buffer.byteLength(content)
  if (bytes > MAX_FILE_BYTES) {
    return `"${path}" would be ${formatSize(bytes)}: a file can be at most ${formatSize(MAX_FILE_BYTES)}. Split it into several files.`
  }

  const others = (await listProjectFiles(versionId)).filter(file => file.path !== path)
  if (others.length >= MAX_FILES) return `The project already has ${MAX_FILES} files: delete one before adding another.`

  const total = sumBytes(others) + bytes
  if (total > MAX_FILES_BYTES) {
    return `The project files would add up to ${formatSize(total)}: the limit is ${formatSize(MAX_FILES_BYTES)}.`
  }

  return null
}

async function writeFile(ctx, path, content) {
  const problem = await findFileWriteProblem(ctx.job.id, path, content)
  if (problem) return errorResult(problem)

  await saveProjectFile(ctx.job.id, path, content)
  ctx.state.lastCheck = null

  return json({ path, bytes: Buffer.byteLength(content) })
}

function countOccurrences(text, search) {
  return text.split(search).length - 1
}

function applyEdit(content, { path, oldString, newString, replaceAll }) {
  if (!oldString) return { error: 'oldString cannot be empty.' }

  const occurrences = countOccurrences(content, oldString)
  if (occurrences === 0) return { error: `oldString was not found in "${path}": read the file and copy it exactly.` }
  if (occurrences > 1 && !replaceAll) {
    return {
      error: `oldString appears ${occurrences} times in "${path}": add surrounding lines to make it unique, or set replaceAll.`,
    }
  }

  return { value: content.split(oldString).join(newString) }
}

function buildFileTools(ctx) {
  const versionId = ctx.job.id

  return [
    tool({
      name: 'list_project_files',
      description:
        'List the files of the video project with their sizes, and the assets of the video (fonts and images) with their sizes, plus the limits.',
      parameters: z.object({}),
      execute: async () => {
        const [files, assets] = await Promise.all([listProjectFiles(versionId), listVideoAssets(ctx.job.videoId)])
        return json({
          files,
          assets,
          limits: { files: MAX_FILES, fileBytes: MAX_FILE_BYTES, filesBytes: MAX_FILES_BYTES },
        })
      },
    }),
    tool({
      name: 'read_project_file',
      description: 'Read a whole file of the video project.',
      parameters: z.object({ path: PATH_PARAM }),
      execute: async ({ path }) => {
        const content = await readProjectFile(versionId, path)
        if (content === null) return errorResult(`"${path}" does not exist. List the files with list_project_files.`)

        return json({ path, content })
      },
    }),
    tool({
      name: 'write_project_file',
      description: `Create a file of the video project or replace it entirely. Text files only (.js, .css, .json, .svg), lowercase paths, never under assets/ or kit/; at most ${MAX_FILES} files, ${formatSize(MAX_FILE_BYTES)} each and ${formatSize(MAX_FILES_BYTES)} in total.`,
      parameters: z.object({ path: PATH_PARAM, content: z.string().describe('The whole content of the file.') }),
      execute: ({ path, content }) => writeFile(ctx, path, content),
    }),
    tool({
      name: 'edit_project_file',
      description:
        'Change part of a project file by exact string replacement. oldString must match the file exactly, whitespace included, and appear once unless replaceAll is true.',
      parameters: z.object({
        path: PATH_PARAM,
        oldString: z.string().describe('The exact text to replace.'),
        newString: z.string().describe('The text that replaces it.'),
        replaceAll: z.boolean().default(false).describe('Replace every occurrence instead of exactly one.'),
      }),
      execute: async input => {
        const content = await readProjectFile(versionId, input.path)
        if (content === null) return errorResult(`"${input.path}" does not exist. Create it with write_project_file.`)

        const edited = applyEdit(content, input)
        if (edited.error) return errorResult(edited.error)

        return writeFile(ctx, input.path, edited.value)
      },
    }),
    tool({
      name: 'delete_project_file',
      description: 'Delete a file of the video project. Remember to remove it from project.json too.',
      parameters: z.object({ path: PATH_PARAM }),
      execute: async ({ path }) => {
        if (!(await deleteProjectFile(versionId, path))) return errorResult(`"${path}" does not exist.`)

        ctx.state.lastCheck = null
        return json({ deleted: path })
      },
    }),
  ]
}

async function storeAsset(ctx, { name, data }) {
  validateAsset(name, { data })

  const others = (await listVideoAssets(ctx.job.videoId)).filter(asset => asset.name !== name)
  const total = sumBytes(others) + data.length
  if (total > MAX_ASSETS_BYTES) {
    throw new VideoProjectError(
      `The assets would add up to ${formatSize(total)}: the limit is ${formatSize(MAX_ASSETS_BYTES)} per video.`
    )
  }

  const mimeType = ASSET_MIME_TYPES[extname(name)]
  await saveVideoAsset(ctx.job.videoId, { name, mimeType, data })
  ctx.state.lastCheck = null

  return json({ name, mimeType, bytes: data.length, css: `url("assets/${name}")`, js: `R.asset('${name}')` })
}

async function copyRepoAsset(ctx, { repo, path, name }) {
  const { repos } = ctx.job.video.brief
  if (!repos.includes(repo)) return errorResult(`"${repo}" is not a repository of this brief: use ${repos.join(', ')}.`)

  let data
  try {
    data = await readBinaryFile(repo, path, { maxBytes: MAX_ASSET_BYTES })
  } catch (error) {
    return errorResult(error.message)
  }

  return storeAsset(ctx, { name, data })
}

function decodeDataUri(uri) {
  const match = DATA_URI_RE.exec(uri)
  return { mimeType: match[1], data: Buffer.from(match[2], 'base64') }
}

async function useAttachmentImage(ctx, { imageId, name }) {
  const { brief, userId } = ctx.job.video
  if (!brief.attachments.some(attachment => attachment.imageId === imageId)) {
    return errorResult('That image is not attached to the brief.')
  }

  const stored = await getAttachmentImages([imageId], userId)
  if (!stored.has(imageId)) return errorResult('That image is no longer available.')

  const image = decodeDataUri(stored.get(imageId))
  if (ASSET_MIME_TYPES[extname(name)] !== image.mimeType) {
    return errorResult(`The image is ${image.mimeType}: give the asset name the matching extension.`)
  }

  return storeAsset(ctx, { name, data: image.data })
}

function buildAssetTools(ctx) {
  return [
    tool({
      name: 'copy_repo_asset',
      description: `Copy a font (woff2, woff, ttf, otf) or an image (svg, png, jpg, webp, gif) from one of the brief's repositories into the video's assets, at most ${formatSize(MAX_ASSET_BYTES)} each and ${formatSize(MAX_ASSETS_BYTES)} per video. Copying to an existing name replaces it.`,
      parameters: z.object({
        repo: z.string().describe('Full repository name "owner/repo".'),
        path: z.string().describe('File path inside the repo.'),
        name: ASSET_NAME_PARAM,
      }),
      execute: input => guarded(() => copyRepoAsset(ctx, input)),
    }),
    tool({
      name: 'use_attachment_image',
      description:
        "Add an image attached to the brief to the video's assets, so the video can show it. The name's extension must match the image type.",
      parameters: z.object({
        imageId: z.string().describe('The image ID listed under the attached images of the brief.'),
        name: ASSET_NAME_PARAM,
      }),
      execute: input => guarded(() => useAttachmentImage(ctx, input)),
    }),
  ]
}

async function bundleVersion(ctx) {
  const [files, assets] = await Promise.all([readProjectFiles(ctx.job.id), loadVideoAssets(ctx.job.videoId)])
  return bundleProject({ files, assets, kit: loadKit(), mode: 'render' }).html
}

function countCueTypes(cues) {
  const counts = {}
  for (const cue of cues) counts[cue.type] = (counts[cue.type] ?? 0) + 1

  return counts
}

function failedCheck(error) {
  return { ok: false, errors: [error.message], warnings: [], meta: null, cues: [], captions: [], seekMs: null }
}

export async function runVideoCheck(ctx) {
  let report
  try {
    report = await inspectProject({ html: await bundleVersion(ctx), pace: ctx.job.video.brief.pace })
  } catch (error) {
    if (!(error instanceof VideoProjectError)) throw error
    report = failedCheck(error)
  }

  ctx.state.lastCheck = report
  return report
}

function summarizeCheck(report) {
  return json({
    ok: report.ok,
    errors: report.errors,
    warnings: report.warnings,
    meta: report.meta,
    cues: { total: report.cues.length, byType: countCueTypes(report.cues) },
    captions: report.captions,
    seekMs: report.seekMs,
  })
}

async function previewFrames(ctx, { times, columns }) {
  const html = await bundleVersion(ctx)
  const sheet = await captureContactSheet({ html, times, columns })
  if (!sheet.png) return errorResult(`No frame could be drawn. ${sheet.errors.join(' ')}`.trim())

  const frameId = await saveVersionFrame(ctx.job.id, { times, image: sheet.png })
  return [
    { type: 'text', text: json({ frameId, times, errors: sheet.errors }) },
    { type: 'image', image: `data:image/png;base64,${sheet.png.toString('base64')}` },
  ]
}

function buildReviewTools(ctx) {
  return [
    tool({
      name: 'check_video',
      description:
        "Bundle the project and load it in Chromium like the renderer does. Reports boot errors, contract problems, exceptions from update(t), the soundtrack's level, the cues, every caption with the reading time it needs at the brief's pace, and how long a seek takes. The version only succeeds when the last check of the final files has no errors.",
      parameters: z.object({}),
      execute: () => guarded(async () => summarizeCheck(await runVideoCheck(ctx))),
    }),
    tool({
      name: 'preview_frames',
      description: `Draw the video at the given instants and look at them as one contact sheet image, each tile labelled with its time. Use it across every scene to review the composition, the text and the brand, and after each fix. Up to ${MAX_SHEET_TIMES} instants per sheet.`,
      parameters: z.object({
        times: z.array(z.number().min(0)).min(1).max(MAX_SHEET_TIMES).describe('Instants to draw, in seconds.'),
        columns: z
          .number()
          .int()
          .min(1)
          .max(MAX_SHEET_COLUMNS)
          .default(DEFAULT_SHEET_COLUMNS)
          .describe(`Tiles per row. Default ${DEFAULT_SHEET_COLUMNS}; use 2 or 3 to see details larger.`),
      }),
      execute: input => guarded(() => previewFrames(ctx, input)),
    }),
    tool({
      name: 'report_progress',
      description:
        'Tell the user, in one short sentence in the language of the brief, what you are doing or have just achieved. It appears live in the studio next to the video.',
      parameters: z.object({ note: z.string().min(1).max(MAX_NOTE_LENGTH) }),
      execute: ({ note }) => {
        ctx.reporter.event(note)
        return 'Shown to the user.'
      },
    }),
  ]
}

export function buildVideoTools(ctx) {
  return [
    ...buildRepoTools(ctx.job.video.brief.repos),
    ...buildFileTools(ctx),
    ...buildAssetTools(ctx),
    ...buildReviewTools(ctx),
  ]
}

const STEP_DESCRIPTIONS = {
  list_project_files: () => 'Listing the project files',
  read_project_file: input => `Reading ${input.path}`,
  write_project_file: input => `Writing ${input.path}`,
  edit_project_file: input => `Editing ${input.path}`,
  delete_project_file: input => `Deleting ${input.path}`,
  copy_repo_asset: input => `Copying ${input.name} from ${input.repo}`,
  use_attachment_image: input => `Adding the image ${input.name}`,
  check_video: () => 'Checking the page',
  preview_frames: input => `Reviewing frames at ${input.times.map(formatClock).join(', ')}`,
  report_progress: input => input.note,
  get_directory_contents: input => `Exploring ${input.repo}`,
  get_file_contents: input => `Reading ${input.path} in ${input.repo}`,
  search_code: input => `Searching ${input.repo} for "${input.query}"`,
  find_files: input => `Looking for ${input.pattern} in ${input.repo}`,
  git_log_file: input => `Reading the history of ${input.path}`,
  git_blame: input => `Reading the history of ${input.path}`,
}

export function describeToolStep(name, rawArguments) {
  const describe = STEP_DESCRIPTIONS[name]
  if (!describe) return `Running ${name}`

  try {
    return describe(JSON.parse(rawArguments || '{}'))
  } catch {
    return `Running ${name}`
  }
}
