;(function () {
  'use strict'

  const PROJECT = window.__PROJECT__
  const BEZIER_STEPS = 30
  const BEZIER_EPSILON = 1e-6
  const BLINK_HOLD = 0.55
  const BLINK_PERIOD = 1.06
  const DEFAULT_CPS = 20
  const TOKEN_RE = /<code\b[^>]*>[\s\S]*?<\/code>|<\/?[a-zA-Z][^>]*>|[^<]+/gi
  const CODE_RE = /^<code\b/i
  const BR_RE = /^<br\b/i
  const EM_OPEN_RE = /^<em\b/i
  const EM_CLOSE_RE = /^<\/em\b/i
  const TAG_RE = /^</
  const SPACES_RE = /(\s+)/
  const ONLY_SPACES_RE = /^\s+$/
  const LOG_FIELDS = ['k', 'z']
  const STATE = { video: null, music: null, cues: [], captions: [], errors: [], sealed: false }
  const WRITES = new WeakMap()

  function clamp(x, a = 0, b = 1) {
    if (x < a) return a
    if (x > b) return b
    return x
  }

  function lerp(a, b, p) {
    return a + (b - a) * p
  }

  function prog(t, a, b) {
    if (b === a) return t >= b ? 1 : 0
    return clamp((t - a) / (b - a))
  }

  function loglerp(a, b, p) {
    return Math.exp(lerp(Math.log(a), Math.log(b), p))
  }

  function solveBezierX(sampleX, p) {
    let lo = 0
    let hi = 1
    let u = p
    for (let i = 0; i < BEZIER_STEPS; i++) {
      const x = sampleX(u)
      if (Math.abs(x - p) < BEZIER_EPSILON) break
      if (x < p) lo = u
      else hi = u
      u = (lo + hi) / 2
    }
    return u
  }

  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1
    const bx = 3 * (x2 - x1) - cx
    const ax = 1 - cx - bx
    const cy = 3 * y1
    const by = 3 * (y2 - y1) - cy
    const ay = 1 - cy - by

    function sampleX(u) {
      return ((ax * u + bx) * u + cx) * u
    }

    function sampleY(u) {
      return ((ay * u + by) * u + cy) * u
    }

    return function ease(p) {
      if (p <= 0) return 0
      if (p >= 1) return 1
      return sampleY(solveBezierX(sampleX, p))
    }
  }

  function inOutExpo(p) {
    if (p <= 0) return 0
    if (p >= 1) return 1
    if (p < 0.5) return Math.pow(2, 20 * p - 10) / 2
    return (2 - Math.pow(2, -20 * p + 10)) / 2
  }

  const E = {
    linear: p => p,
    inQuad: p => p * p,
    outQuad: p => 1 - (1 - p) * (1 - p),
    inOutQuad: p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    inCubic: p => p * p * p,
    outCubic: p => 1 - Math.pow(1 - p, 3),
    inOutCubic: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    inQuart: p => p * p * p * p,
    outQuart: p => 1 - Math.pow(1 - p, 4),
    inOutQuart: p => (p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2),
    outQuint: p => 1 - Math.pow(1 - p, 5),
    inOutQuint: p => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2),
    inExpo: p => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10)),
    outExpo: p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inOutExpo,
    inOutSine: p => -(Math.cos(Math.PI * p) - 1) / 2,
    outSine: p => Math.sin((p * Math.PI) / 2),
    inSine: p => 1 - Math.cos((p * Math.PI) / 2),
    outBack: p => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2),
    outBackSoft: p => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2),
    inBack: p => 2.70158 * p * p * p - 1.70158 * p * p,
    whip: bezier(0.8, 0, 0.12, 1),
    snap: bezier(0.2, 0, 0, 1),
    glide: bezier(0.45, 0, 0.1, 1),
    ui: bezier(0.4, 0, 0.2, 1),
    move: bezier(0.55, 0.05, 0.25, 1),
  }

  function spring(dt, f = 3, z = 0.5) {
    if (dt <= 0) return 0

    const w = 2 * Math.PI * f
    if (z >= 1) return 1 - (1 + w * dt) * Math.exp(-w * dt)

    const wd = w * Math.sqrt(1 - z * z)
    return 1 - Math.exp(-z * w * dt) * (Math.cos(wd * dt) + ((z * w) / wd) * Math.sin(wd * dt))
  }

  function rng(seed) {
    let a = seed >>> 0
    return function next() {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function hash1(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  function vnoise(x, seed = 0) {
    const i = Math.floor(x)
    const f = x - i
    const u = f * f * (3 - 2 * f)
    return lerp(hash1(i + seed * 57.31), hash1(i + 1 + seed * 57.31), u) * 2 - 1
  }

  function round4(v) {
    return Math.round(v * 10000) / 10000
  }

  function f2(v) {
    return Math.abs(v) < 1e-4 ? 0 : Math.round(v * 100) / 100
  }

  function writesOf(node) {
    const known = WRITES.get(node)
    if (known) return known

    const writes = { style: {}, classes: {}, text: undefined, html: undefined }
    WRITES.set(node, writes)
    return writes
  }

  function el(tag, className, parent, html) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (html != null) node.innerHTML = html
    if (parent) parent.appendChild(node)
    return node
  }

  function S(node, key, value) {
    const style = writesOf(node).style
    if (style[key] === value) return

    style[key] = value
    node.style[key] = value
  }

  function show(node, visible) {
    S(node, 'display', visible ? '' : 'none')
  }

  function setText(node, text) {
    const writes = writesOf(node)
    if (writes.text === text) return

    writes.text = text
    node.textContent = text
  }

  function setHTML(node, html) {
    const writes = writesOf(node)
    if (writes.html === html) return

    writes.html = html
    node.innerHTML = html
  }

  function cls(node, name, on) {
    const classes = writesOf(node).classes
    if (classes[name] === on) return

    classes[name] = on
    node.classList.toggle(name, on)
  }

  function tf(x, y, s = 1, r = 0) {
    return `translate(${f2(x)}px,${f2(y)}px) rotate(${round4(r)}rad) scale(${round4(s)})`
  }

  function opacityOf(t, [a, b, c, d]) {
    if (t < a || t > d) return 0
    if (t < b) return E.outCubic(prog(t, a, b))
    if (t > c) return 1 - E.inCubic(prog(t, c, d))
    return 1
  }

  function pick(key, fields) {
    const out = {}
    for (const field of fields) out[field] = key[field] ?? 0
    return out
  }

  function interpolateKeys(a, b, p, fields) {
    const out = {}
    for (const field of fields) {
      const from = a[field] ?? 0
      const to = b[field] ?? from
      out[field] = LOG_FIELDS.includes(field) ? loglerp(from, to, p) : lerp(from, to, p)
    }
    return out
  }

  function keyframes(keys, t, fields) {
    if (t <= keys[0].t) return pick(keys[0], fields)

    for (let i = 1; i < keys.length; i++) {
      const b = keys[i]
      if (t > b.t) continue

      const a = keys[i - 1]
      const ease = b.e || E.inOutCubic
      return interpolateKeys(a, b, ease(prog(t, a.t, b.t)), fields)
    }
    return pick(keys[keys.length - 1], fields)
  }

  function fillKeys(keys, fields) {
    let previous = {}
    return keys.map(key => {
      const full = { ...key }
      for (const field of fields) if (full[field] === undefined) full[field] = previous[field]
      previous = full
      return full
    })
  }

  function blink(t, since, period = BLINK_PERIOD) {
    if (t - since < BLINK_HOLD) return 1
    return (t - since - BLINK_HOLD) % period < period / 2 ? 0 : 1
  }

  function wrapWord(inner) {
    return `<span class="wm"><span class="w">${inner}</span></span>`
  }

  function pushText(out, text, inEm) {
    for (const part of text.split(SPACES_RE)) {
      if (!part) continue
      if (ONLY_SPACES_RE.test(part)) out.push(' ')
      else out.push(wrapWord(inEm ? `<em>${part}</em>` : part))
    }
  }

  function pushToken(out, token, context) {
    if (CODE_RE.test(token)) out.push(wrapWord(token))
    else if (BR_RE.test(token)) out.push('<br>')
    else if (EM_OPEN_RE.test(token)) context.em += 1
    else if (EM_CLOSE_RE.test(token)) context.em = Math.max(0, context.em - 1)
    else if (!TAG_RE.test(token)) pushText(out, token, context.em > 0)
  }

  function splitWords(html) {
    const out = []
    const context = { em: 0 }
    for (const token of html.match(TOKEN_RE) || []) pushToken(out, token, context)
    return out.join('')
  }

  function keyDelay(ch, cps, random) {
    let dt = (1 / cps) * (0.75 + random() * 0.5)
    if (ch === ' ') dt *= 1.25
    if (ch === '.' || ch === ',') dt *= 1.15
    return dt
  }

  function keyTimes(text, t0, options = {}) {
    const { cps = DEFAULT_CPS, seed = 1 } = options
    const random = rng(seed * 7919 + 17)
    const times = []
    let t = t0
    for (let i = 0; i < text.length; i++) {
      times.push(t)
      cue(t, 'key', { i })
      t += keyDelay(text[i], cps, random)
    }
    return times
  }

  function assertOpen(name) {
    if (STATE.sealed)
      throw new Error(`${name} was called after init(): register cues and captions at load time or in init.`)
  }

  function cue(t, type, extra = {}) {
    assertOpen('R.cue()')
    if (!Number.isFinite(t)) throw new TypeError(`R.cue(t, type): t must be a number of seconds, got ${t}.`)
    if (typeof type !== 'string' || !type) throw new TypeError('R.cue(t, type): type must be a non-empty string.')

    STATE.cues.push({ ...extra, t: round4(t), type })
  }

  function caption(text, from, to) {
    assertOpen('R.caption()')
    if (typeof text !== 'string' || !text.trim())
      throw new TypeError('R.caption(text, from, to): text must be a string.')
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      throw new TypeError(`R.caption("${text}", from, to): from and to must be seconds with from < to.`)
    }

    STATE.captions.push({ text, from: round4(from), to: round4(to) })
  }

  function asset(name) {
    const assets = window.__ASSETS__
    if (Object.hasOwn(assets, name)) return assets[name]

    const known = Object.keys(assets).join(', ') || 'none'
    throw new Error(`R.asset("${name}"): there is no such asset. Available: ${known}.`)
  }

  const VIDEO_RULES = [
    [definition => Number.isFinite(definition.duration) && definition.duration > 0, 'duration must be seconds > 0'],
    [definition => typeof definition.init === 'function', 'init(stage) must be a function'],
    [definition => typeof definition.update === 'function', 'update(t) must be a function'],
    [definition => ['undefined', 'function'].includes(typeof definition.motion), 'motion(t) must be a function'],
    [definition => definition.hints === undefined || Array.isArray(definition.hints), 'hints must be an array'],
  ]

  function video(definition) {
    assertOpen('R.video()')
    if (STATE.video) throw new Error('R.video() was called twice: register the video exactly once.')
    if (!definition || typeof definition !== 'object')
      throw new TypeError('R.video() takes { duration, init, update }.')

    const broken = VIDEO_RULES.find(([isValid]) => !isValid(definition))
    if (broken) throw new TypeError(`R.video(): ${broken[1]}.`)

    STATE.video = definition
  }

  function music(arrangement) {
    assertOpen('R.music()')
    if (STATE.music) throw new Error('R.music() was called twice: write the whole arrangement in one function.')
    if (typeof arrangement !== 'function') throw new TypeError('R.music(fn): fn must be a function.')

    STATE.music = arrangement
  }

  function describeError(error, fallback) {
    if (error && error.stack) return String(error.stack)
    return String(error ?? fallback)
  }

  function recordError(event) {
    const where = event.lineno ? ` (bundle line ${event.lineno})` : ''
    STATE.errors.push(`${describeError(event.error, event.message)}${where}`)
  }

  function recordRejection(event) {
    STATE.errors.push(describeError(event.reason, 'Unhandled promise rejection'))
  }

  window.addEventListener('error', recordError)
  window.addEventListener('unhandledrejection', recordRejection)

  const R = {
    W: PROJECT.width,
    H: PROJECT.height,
    FPS: PROJECT.fps,
    CUES: STATE.cues,
    CAPTIONS: STATE.captions,
    E,
    clamp,
    lerp,
    prog,
    loglerp,
    bezier,
    spring,
    rng,
    hash1,
    vnoise,
    el,
    S,
    show,
    setText,
    setHTML,
    cls,
    tf,
    opacityOf,
    keyframes,
    fillKeys,
    blink,
    splitWords,
    keyTimes,
    cue,
    caption,
    asset,
    video,
    music,
  }
  Object.defineProperty(R, '_kit', { value: STATE })

  window.R = R
})()
