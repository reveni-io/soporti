import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeDom } from '../__tests__/fake-dom.js'
import { KIT_REFERENCE_SECTION } from './prompt.js'

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
