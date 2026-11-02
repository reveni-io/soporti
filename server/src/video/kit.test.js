import { describe, expect, it, vi } from 'vitest'

const { readFileSpy } = vi.hoisted(() => ({ readFileSpy: vi.fn() }))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal()
  readFileSpy.mockImplementation(actual.readFileSync)
  return { ...actual, readFileSync: readFileSpy }
})

const { readFileSync } = await vi.importActual('node:fs')

function kitFile(name) {
  return readFileSync(new URL(`./kit/${name}`, import.meta.url), 'utf8')
}

describe('loadKit', () => {
  it('returns the kit scripts in load order and the runtime', async () => {
    const { loadKit } = await import('./kit.js')

    const kit = loadKit()

    expect(kit.scripts).toEqual([
      { name: 'core.js', content: kitFile('core.js') },
      { name: 'synth.js', content: kitFile('synth.js') },
    ])
    expect(kit.runtime).toBe(kitFile('runtime.js'))
  })

  it('reads the kit files once and returns the same frozen kit', async () => {
    vi.resetModules()
    const { loadKit } = await import('./kit.js')
    readFileSpy.mockClear()

    const first = loadKit()
    const second = loadKit()

    expect(second).toBe(first)
    expect(readFileSpy).toHaveBeenCalledTimes(3)
    expect(readFileSpy.mock.calls.map(([url]) => url.pathname.split('/').at(-1))).toEqual([
      'core.js',
      'synth.js',
      'runtime.js',
    ])
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.scripts)).toBe(true)
    expect(Object.isFrozen(first.scripts[0])).toBe(true)
  })

  it('ships classic scripts wrapped in one strict IIFE each', async () => {
    const { loadKit } = await import('./kit.js')
    const { scripts, runtime } = loadKit()

    for (const content of [...scripts.map(script => script.content), runtime]) {
      expect(content.startsWith(";(function () {\n  'use strict'\n")).toBe(true)
      expect(content.trimEnd().endsWith('})()')).toBe(true)
      expect(content).not.toMatch(/^\s*(import|export)\s/m)
    }
  })
})
