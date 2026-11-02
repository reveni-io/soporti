import { readFileSync } from 'node:fs'

const KIT_DIR = new URL('./kit/', import.meta.url)
const SCRIPT_NAMES = ['core.js', 'synth.js']
const RUNTIME_NAME = 'runtime.js'

let cachedKit = null

function readKitFile(name) {
  return readFileSync(new URL(name, KIT_DIR), 'utf8')
}

export function loadKit() {
  if (cachedKit) return cachedKit

  cachedKit = Object.freeze({
    scripts: Object.freeze(SCRIPT_NAMES.map(name => Object.freeze({ name, content: readKitFile(name) }))),
    runtime: readKitFile(RUNTIME_NAME),
  })
  return cachedKit
}
