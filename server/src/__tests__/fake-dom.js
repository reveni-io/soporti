const DEFAULT_PROJECT = { title: 'Test video', width: 1920, height: 1080, fps: 60 }
const DATA_URL_PREFIX = 'data:'

function classNames(element) {
  return new Set(element.className.split(' ').filter(Boolean))
}

class FakeElement {
  constructor(tagName, registry) {
    this.tagName = tagName.toUpperCase()
    this.registry = registry
    this.children = []
    this.parentNode = null
    this.style = {}
    this.attributes = {}
    this.listeners = {}
    this.className = ''
    this.innerHTML = ''
    this.textContent = ''
    this.src = ''
    this.value = ''
    this.blurred = false
  }

  get classList() {
    const element = this
    return {
      contains(name) {
        return classNames(element).has(name)
      },
      toggle(name, force) {
        const names = classNames(element)
        if (force ?? !names.has(name)) names.add(name)
        else names.delete(name)
        element.className = [...names].join(' ')
      },
    }
  }

  appendChild(child) {
    child.parentNode = this
    this.children.push(child)
    return child
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value)
  }

  getAttribute(name) {
    return this.attributes[name] ?? null
  }

  addEventListener(type, listener) {
    this.listeners[type] = [...(this.listeners[type] || []), listener]
  }

  blur() {
    this.blurred = true
  }

  decode() {
    if (this.src.startsWith(DATA_URL_PREFIX)) return Promise.resolve()
    return Promise.reject(new Error(`Could not load ${this.src}`))
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      target: this,
      stopped: false,
      defaultPrevented: false,
      stopPropagation() {
        event.stopped = true
      },
      preventDefault() {
        event.defaultPrevented = true
      },
      ...init,
    }
    for (let node = this; node && !event.stopped; node = node.parentNode) {
      for (const listener of node.listeners[type] || []) listener(event)
    }
    return event
  }

  find(className) {
    if (classNames(this).has(className)) return this
    for (const child of this.children) {
      const match = child.find(className)
      if (match) return match
    }
    return null
  }
}

function createFace(font) {
  return {
    family: font.family,
    weight: font.weight || '400',
    style: font.style || 'normal',
    loaded: false,
    load() {
      this.loaded = true
      return font.fails ? Promise.reject(new Error('bad font')) : Promise.resolve(this)
    },
  }
}

function createAudio() {
  const contexts = []

  class FakeAudioContext {
    constructor(options) {
      this.sampleRate = options.sampleRate
      this.state = 'suspended'
      this.currentTime = 0
      this.destination = { kind: 'destination' }
      this.sources = []
      contexts.push(this)
    }

    resume() {
      this.state = 'running'
      return Promise.resolve()
    }

    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length))
      return {
        length,
        sampleRate,
        data,
        copyToChannel(source, channel) {
          data[channel].set(source)
        },
      }
    }

    createBufferSource() {
      const source = { buffer: null, started: null, stopped: false, connectedTo: null }
      source.connect = destination => {
        source.connectedTo = destination
      }
      source.disconnect = () => {
        source.connectedTo = null
      }
      source.start = (when, offset) => {
        source.started = { when, offset }
      }
      source.stop = () => {
        source.stopped = true
      }
      this.sources.push(source)
      return source
    }
  }

  return { contexts, FakeAudioContext }
}

function createDocument(registry, fonts) {
  const body = new FakeElement('body', registry)
  const head = new FakeElement('head', registry)
  const stage = body.appendChild(new FakeElement('div', registry))
  stage.id = 'stage'
  const faces = fonts.map(createFace)
  return {
    body,
    head,
    stage,
    faces,
    fonts: {
      ready: Promise.resolve(),
      [Symbol.iterator]() {
        return faces[Symbol.iterator]()
      },
    },
    get images() {
      return registry.images.filter(image => image.parentNode)
    },
    createElement(tagName) {
      const element = new FakeElement(tagName, registry)
      if (element.tagName === 'IMG') registry.images.push(element)
      return element
    },
    getElementById(id) {
      return id === 'stage' ? stage : null
    },
  }
}

export function installFakeDom(options = {}) {
  const { project = DEFAULT_PROJECT, assets = {}, mode = 'render', fonts = [] } = options
  const before = new Set(Reflect.ownKeys(globalThis))
  const registry = { images: [] }
  const listeners = {}
  const frames = new Map()
  const audio = createAudio()
  const document = createDocument(registry, fonts)
  let nextFrame = 1

  class FakeImage extends FakeElement {
    constructor() {
      super('img', registry)
    }
  }

  Object.assign(globalThis, {
    window: globalThis,
    document,
    __MODE__: mode,
    __PROJECT__: project,
    __ASSETS__: assets,
    innerWidth: 1280,
    innerHeight: 720,
    Image: FakeImage,
    AudioContext: audio.FakeAudioContext,
    addEventListener(type, listener) {
      listeners[type] = [...(listeners[type] || []), listener]
    },
    requestAnimationFrame(callback) {
      frames.set(nextFrame, callback)
      nextFrame += 1
      return nextFrame - 1
    },
    cancelAnimationFrame(id) {
      frames.delete(id)
    },
  })
  const installed = new Set(Reflect.ownKeys(globalThis))

  return {
    document,
    stage: document.stage,
    audioContexts: audio.contexts,
    fire(type, init = {}) {
      const event = { type, defaultPrevented: false, preventDefault: () => (event.defaultPrevented = true), ...init }
      for (const listener of listeners[type] || []) listener(event)
      return event
    },
    runFrame() {
      const pending = [...frames.entries()]
      frames.clear()
      for (const [, callback] of pending) callback()
      return pending.length
    },
    leakedGlobals() {
      return Reflect.ownKeys(globalThis).filter(key => !installed.has(key))
    },
    uninstall() {
      for (const key of Reflect.ownKeys(globalThis)) if (!before.has(key)) delete globalThis[key]
    },
  }
}
