import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeDom } from '../__tests__/fake-dom.js'
import {
  KIT_REFERENCE_SECTION,
  VIDEO_INSTRUCTIONS,
  buildCompositionPrompt,
  buildCompositionTurnLimitMessage,
} from './prompt.js'

const RUNTIME_ONLY_SYNTH = ['begin', 'master']

let dom

afterEach(() => {
  dom?.uninstall()
})

describe('KIT_REFERENCE_SECTION', () => {
  it('documents every helper the kit exposes to the model', async () => {
    vi.resetModules()
    dom = installFakeDom()
    await import('./kit/core.js')
    await import('./kit/synth.js')

    for (const name of Object.keys(globalThis.R)) expect(KIT_REFERENCE_SECTION).toContain(`R.${name}`)
    for (const name of Object.keys(globalThis.R.E)) expect(KIT_REFERENCE_SECTION).toContain(`\`${name}\``)
    for (const name of Object.keys(globalThis.SYNTH).filter(key => !RUNTIME_ONLY_SYNTH.includes(key))) {
      expect(KIT_REFERENCE_SECTION).toMatch(new RegExp(`\\b${name}\\b`))
    }
  })

  it('states the rules every project must follow', () => {
    for (const rule of [
      'Classic scripts only',
      '`update(t)` is pure',
      'No `Math.random`',
      '`setTimeout`',
      '`Date`',
      'Assets only through `R.asset(name)` or `url("assets/name")`',
      'Every text the viewer must read goes through `R.caption(text, from, to)`',
      'Register a cue for every event that deserves a sound',
    ]) {
      expect(KIT_REFERENCE_SECTION).toContain(rule)
    }
  })
})

const BRIEF = {
  idea: 'Refunds in one click',
  repos: ['acme/web', 'acme/ui'],
  path: 'apps/dashboard',
  audience: 'merchants',
  language: 'es',
  format: '16:9',
  durationSeconds: 30,
  pace: 'relaxed',
  attachments: [
    { name: 'spec.pdf', text: 'Refunds go out at once.' },
    { name: 'shot.png', imageId: 'img-1' },
  ],
}
const STORYBOARD = { title: 'Reembolsos', scenes: [{ start: 0, end: 30, title: 'All' }] }

function prompt({ version = {}, brief = {}, previousSummary = null, hasFiles = false } = {}) {
  return buildCompositionPrompt({
    video: { brief: { ...BRIEF, ...brief }, storyboard: STORYBOARD },
    version: { basedOn: null, request: null, resume: false, ...version },
    previousSummary,
    availableImageIds: new Set(['img-1']),
    hasFiles,
  })
}

describe('VIDEO_INSTRUCTIONS', () => {
  it('is built around the kit reference and the workflow of the tools', () => {
    expect(VIDEO_INSTRUCTIONS).toContain(KIT_REFERENCE_SECTION)
    for (const tool of [
      'copy_repo_asset',
      'write_project_file',
      'edit_project_file',
      'check_video',
      'preview_frames',
      'report_progress',
    ]) {
      expect(VIDEO_INSTRUCTIONS).toContain(`\`${tool}\``)
    }
  })

  it('holds the quality bars of the reference videos', () => {
    for (const bar of [
      'Recreate the actual UI',
      'No generic "AI" look',
      'A camera with intent',
      'A cursor that clicks',
      'word by word',
      'Sound for every cue',
      'S.tempo',
      'Motion blur on fast moves',
      '`update(t)` is pure',
      'R.DATA',
      'outro',
    ]) {
      expect(VIDEO_INSTRUCTIONS).toContain(bar)
    }
  })
})

describe('buildCompositionPrompt', () => {
  it('gives the brief with the exact project settings and the reading rule of the pace', () => {
    const text = prompt()

    expect(text).toContain('- Repositories: acme/web, acme/ui')
    expect(text).toContain('- Folder: apps/dashboard')
    expect(text).toContain('- Language of every text in the video: Spanish (es)')
    expect(text).toContain('`project.json` uses width 1920, height 1080 and fps 60.')
    expect(text).toContain('`R.video({ duration: 30 })`')
    expect(text).toContain('0.5 s plus 0.4 s per word (a 6-word caption needs 2.9 s)')
    expect(text).toContain('### spec.pdf\n\nRefunds go out at once.')
    expect(text).toContain('- shot.png (attached below)')
    expect(text).toContain('"title": "Reembolsos"')
    expect(text).toContain('Compose the video from scratch with the approved storyboard. The project is empty.')
    expect(text).not.toContain('## Change request')
  })

  it('drops to 30 fps for long videos and follows the format and the pace', () => {
    const text = prompt({ brief: { format: '9:16', durationSeconds: 90, pace: 'fast', path: null } })

    expect(text).toContain('width 1080, height 1920 and fps 30')
    expect(text).toContain('0.5 s plus 0.25 s per word')
    expect(text).toContain('- Folder: none, the whole repositories')
  })

  it('frames an edit of a previous version with its summary and the request', () => {
    const text = prompt({
      version: { basedOn: 2, request: 'Make it orange.' },
      previousSummary: 'A tour of refunds.',
      hasFiles: true,
    })

    expect(text).toContain(
      '## Version 2\n\nThe project starts as a copy of the files of version 2.\n\nWhat it shows: A tour of refunds.'
    )
    expect(text).toContain('## Change request\n\nMake it orange.')
    expect(text).toContain('Edit the project to answer the change request.')
  })

  it('composes from scratch with the request when there is nothing to edit', () => {
    const text = prompt({ version: { request: 'Use blue.' } })

    expect(text).toContain(
      'Compose the video from scratch with the approved storyboard, and take the change request into account.'
    )
  })

  it('edits copied files without a summary, as for a variant', () => {
    const text = prompt({ version: { request: 'Brand it for Lounge.' }, hasFiles: true })

    expect(text).not.toContain('## Version')
    expect(text).toContain('Edit the project to answer the change request.')
  })

  it('resumes from the files written before a restart', () => {
    const text = prompt({ version: { resume: true }, hasFiles: true })

    expect(text).toContain('continue from them instead of starting over')
  })
})

describe('buildCompositionTurnLimitMessage', () => {
  it('asks for the final message without tools', () => {
    expect(buildCompositionTurnLimitMessage(300)).toContain('You have used all 300 turns of this run')
  })
})
