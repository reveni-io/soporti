;(function () {
  'use strict'

  const SAMPLE_RATE = 48000
  const BYTES_PER_FRAME = 8
  const BASE64_SLICE = 0x8000
  const SEEK_STEP = 1
  const SEEK_STEP_LONG = 5
  const SYNC_TOLERANCE = 0.05
  const END_EPSILON = 1e-3
  const SEEK_KEYS = { ArrowRight: 1, ArrowLeft: -1 }
  const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>'
  const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'
  const SOUND_ON_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  const SOUND_OFF_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
  const PLAYER_CSS = [
    'html, body { background: #000; }',
    '.kit-player { position: fixed; inset: 0; z-index: 2147483647; cursor: pointer; user-select: none;',
    '  font: 500 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; }',
    '.kit-player button { all: unset; display: inline-flex; align-items: center; justify-content: center;',
    '  box-sizing: border-box; cursor: pointer; color: #fff; }',
    '.kit-player svg { width: 22px; height: 22px; fill: currentColor; }',
    '.kit-player__big { position: absolute; left: 50%; top: 50%; width: 84px; height: 84px; margin: -42px 0 0 -42px;',
    '  border-radius: 50%; background: rgba(0, 0, 0, 0.55); transition: opacity 0.2s ease; }',
    '.kit-player .kit-player__big svg { width: 40px; height: 40px; }',
    '.kit-player--playing .kit-player__big { opacity: 0; pointer-events: none; }',
    '.kit-player__bar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center;',
    '  gap: 12px; padding: 32px 16px 12px; cursor: default; transition: opacity 0.25s ease;',
    '  background: linear-gradient(transparent, rgba(0, 0, 0, 0.72)); }',
    '.kit-player--playing:not(:hover) .kit-player__bar { opacity: 0; }',
    '.kit-player__button { width: 32px; height: 32px; border-radius: 6px; }',
    '.kit-player__button:focus-visible { outline: 2px solid #fff; }',
    '.kit-player__button--muted { opacity: 0.6; }',
    '.kit-player__scrubber { flex: 1; min-width: 0; margin: 0; accent-color: #fff; cursor: pointer; }',
    '.kit-player__time { font-variant-numeric: tabular-nums; white-space: nowrap; opacity: 0.85; }',
    '.kit-player__error { position: absolute; left: 16px; right: 16px; top: 16px; padding: 12px 14px;',
    '  border-radius: 8px; background: rgba(150, 20, 20, 0.92); cursor: default; white-space: pre-wrap;',
    '  font: 13px/1.45 ui-monospace, Menlo, monospace; }',
  ].join('\n')

  const R = window.R
  const SYNTH = window.SYNTH
  const KIT = R._kit
  const PROJECT = window.__PROJECT__
  const stage = document.getElementById('stage')
  const soundtrack = { promise: null, result: null }
  const player = { duration: 0, playing: false, position: 0, anchor: 0, frame: 0, scrubbing: false, resume: false }
  const audio = { enabled: true, context: null, buffer: null, source: null, startedAt: 0, offset: 0, pending: null }
  let ui = null
  let errorBox = null
  let hasStyles = false

  function describeError(error) {
    if (error && error.stack) return String(error.stack)
    return String(error)
  }

  function kitError(message) {
    const error = new Error(message)
    error.stack = message
    return error
  }

  function prepareStage() {
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
    Object.assign(stage.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${PROJECT.width}px`,
      height: `${PROJECT.height}px`,
      overflow: 'hidden',
      transformOrigin: '0 0',
    })
  }

  function loadFace(face) {
    return face.load().catch(() => {
      throw kitError(
        `The font "${face.family}" ${face.weight} ${face.style} failed to load: check its file in assets/.`
      )
    })
  }

  async function loadFonts() {
    await Promise.all(Array.from(document.fonts, loadFace))
    await document.fonts.ready
  }

  function shorten(src) {
    return src.length > 60 ? `${src.slice(0, 60)}…` : src
  }

  function decode(image, label) {
    return image.decode().catch(() => {
      throw kitError(`The image ${label} failed to load: reference assets with R.asset(name) or url("assets/name").`)
    })
  }

  function decodeAssets() {
    const images = Object.entries(window.__ASSETS__).filter(([, url]) => url.startsWith('data:image/'))
    return Promise.all(
      images.map(([name, url]) => {
        const image = new Image()
        image.src = url
        return decode(image, `"${name}"`)
      })
    )
  }

  function waitForImages() {
    const images = Array.from(document.images).filter(image => image.src)
    return Promise.all(images.map(image => decode(image, shorten(image.src))))
  }

  function clampTime(t, duration) {
    return Math.min(Math.max(Number(t) || 0, 0), duration)
  }

  function publish(video) {
    const duration = video.duration
    window.__meta = { width: PROJECT.width, height: PROJECT.height, fps: PROJECT.fps, duration }
    window.__CUES__ = KIT.cues.slice().sort((a, b) => a.t - b.t)
    window.__captions = KIT.captions.slice().sort((a, b) => a.from - b.from)
    window.__seek = t => video.update(clampTime(t, duration))
    if (video.hints) window.__hints = video.hints
    if (video.motion) window.__motion = t => video.motion(clampTime(t, duration))
  }

  function silence(frames) {
    return { sampleRate: SAMPLE_RATE, left: new Float32Array(frames), right: new Float32Array(frames), peak: 0 }
  }

  function synthesize() {
    const duration = KIT.video.duration
    if (!KIT.music) return silence(Math.round(duration * SAMPLE_RATE))

    SYNTH.begin({ duration, sampleRate: SAMPLE_RATE })
    KIT.music(SYNTH, { cues: window.__CUES__.map(c => ({ ...c })), duration, sampleRate: SAMPLE_RATE })
    return SYNTH.master()
  }

  function renderSoundtrack() {
    if (!window.__ready) return Promise.reject(kitError('The video has not booted: check __error.'))

    if (!soundtrack.promise) {
      soundtrack.promise = new Promise(resolve => {
        soundtrack.result = synthesize()
        resolve(soundtrack.result)
      })
    }
    return soundtrack.promise.then(({ sampleRate, left, peak }) => ({ sampleRate, frames: left.length, peak }))
  }

  function toBase64(bytes) {
    let binary = ''
    for (let i = 0; i < bytes.length; i += BASE64_SLICE) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_SLICE))
    }
    return btoa(binary)
  }

  function soundtrackChunk(offset, length) {
    if (!soundtrack.result) throw kitError('Call __renderSoundtrack() before __soundtrackChunk().')

    const { left, right } = soundtrack.result
    const start = Math.min(Math.max(0, Math.floor(offset)), left.length)
    const end = Math.min(left.length, start + Math.max(0, Math.floor(length)))
    const view = new DataView(new ArrayBuffer((end - start) * BYTES_PER_FRAME))
    for (let i = start; i < end; i++) {
      view.setFloat32((i - start) * BYTES_PER_FRAME, left[i], true)
      view.setFloat32((i - start) * BYTES_PER_FRAME + 4, right[i], true)
    }
    return toBase64(new Uint8Array(view.buffer))
  }

  function now() {
    return performance.now() / 1000
  }

  function fitStage() {
    const scale = Math.min(window.innerWidth / PROJECT.width, window.innerHeight / PROJECT.height)
    const x = (window.innerWidth - PROJECT.width * scale) / 2
    const y = (window.innerHeight - PROJECT.height * scale) / 2
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  }

  function formatTime(seconds) {
    const whole = Math.floor(seconds)
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
  }

  function addStyles() {
    if (hasStyles) return

    hasStyles = true
    R.el('style', null, document.head, PLAYER_CSS)
  }

  function showError(message) {
    addStyles()
    if (!errorBox) errorBox = R.el('div', 'kit-player__error', ui ? ui.root : R.el('div', 'kit-player', document.body))
    errorBox.textContent = message
  }

  function stopSource() {
    if (!audio.source) return

    audio.source.stop()
    audio.source.disconnect()
    audio.source = null
  }

  function startSource(at) {
    stopSource()
    if (!audio.enabled || !audio.buffer || at >= player.duration) return

    const source = audio.context.createBufferSource()
    source.buffer = audio.buffer
    source.connect(audio.context.destination)
    source.start(0, at)
    audio.source = source
    audio.startedAt = audio.context.currentTime
    audio.offset = at
  }

  function currentTime() {
    if (!player.playing) return player.position
    return clampTime(now() - player.anchor, player.duration)
  }

  function syncToAudio(t) {
    if (!audio.source || audio.context.state !== 'running') return t

    const heard = audio.offset + audio.context.currentTime - audio.startedAt
    if (Math.abs(heard - t) <= SYNC_TOLERANCE) return t

    player.anchor = now() - heard
    return heard
  }

  function renderState() {
    R.cls(ui.root, 'kit-player--playing', player.playing)
    R.setHTML(ui.toggle, player.playing ? PAUSE_ICON : PLAY_ICON)
    ui.toggle.setAttribute('aria-label', player.playing ? 'Pause' : 'Play')
  }

  function renderClock(t) {
    R.setText(ui.time, `${formatTime(t)} / ${formatTime(player.duration)}`)
    if (!player.scrubbing) ui.scrubber.value = String(t)
  }

  function halt(error) {
    player.playing = false
    cancelAnimationFrame(player.frame)
    stopSource()
    renderState()
    showError(describeError(error))
  }

  function draw(t) {
    try {
      window.__seek(t)
    } catch (error) {
      halt(error)
      return
    }
    renderClock(t)
  }

  function tick() {
    if (!player.playing) return

    const t = syncToAudio(now() - player.anchor)
    if (t >= player.duration) {
      pause()
      return
    }
    draw(t)
    if (player.playing) player.frame = requestAnimationFrame(tick)
  }

  function play() {
    if (player.position >= player.duration - END_EPSILON) player.position = 0
    player.playing = true
    player.anchor = now() - player.position
    startSource(player.position)
    player.frame = requestAnimationFrame(tick)
    renderState()
  }

  function pause() {
    player.position = currentTime()
    player.playing = false
    cancelAnimationFrame(player.frame)
    stopSource()
    renderState()
    draw(player.position)
  }

  function seekTo(t) {
    player.position = clampTime(t, player.duration)
    if (player.playing) {
      player.anchor = now() - player.position
      startSource(player.position)
    }
    draw(player.position)
  }

  function renderSound(status) {
    R.cls(ui.sound, 'kit-player__button--muted', !audio.enabled)
    R.setHTML(ui.sound, audio.enabled ? SOUND_ON_ICON : SOUND_OFF_ICON)
    ui.sound.setAttribute('aria-label', audio.enabled ? 'Mute' : 'Unmute')
    ui.sound.setAttribute('title', status)
  }

  function attachBuffer() {
    if (!soundtrack.result) return

    const { left, right } = soundtrack.result
    const buffer = audio.context.createBuffer(2, left.length, SAMPLE_RATE)
    buffer.copyToChannel(left, 0)
    buffer.copyToChannel(right, 1)
    audio.buffer = buffer
    renderSound('Sound on')
    if (player.playing) startSource(currentTime())
  }

  function soundFailed(error) {
    console.error(error)
    renderSound(`The soundtrack failed: ${error.message}`)
  }

  function prepareSound() {
    if (!audio.pending) audio.pending = renderSoundtrack().catch(soundFailed)
    return audio.pending
  }

  function primeSound() {
    setTimeout(prepareSound, 0)
  }

  function unlockAudio() {
    if (!audio.enabled) return

    if (!audio.context) {
      audio.context = new AudioContext({ sampleRate: SAMPLE_RATE })
      prepareSound().then(attachBuffer)
    }
    audio.context.resume()
  }

  function handleFrameClick() {
    unlockAudio()
    if (player.playing) pause()
    else play()
  }

  function handleSoundClick() {
    audio.enabled = !audio.enabled
    renderSound(audio.enabled ? 'Sound on' : 'Sound off')
    if (!audio.enabled) {
      stopSource()
      return
    }
    unlockAudio()
    if (player.playing) startSource(currentTime())
  }

  function handleScrubStart() {
    unlockAudio()
    player.scrubbing = true
    player.resume = player.playing
    if (player.playing) pause()
  }

  function handleScrubInput() {
    seekTo(Number(ui.scrubber.value))
  }

  function handleScrubEnd() {
    if (!player.scrubbing) return

    player.scrubbing = false
    ui.scrubber.blur()
    if (player.resume) play()
  }

  function handleSpace(event) {
    if (event.target.tagName === 'BUTTON') return

    event.preventDefault()
    handleFrameClick()
  }

  function handleKeyDown(event) {
    if (event.code === 'Space') {
      handleSpace(event)
      return
    }

    const direction = SEEK_KEYS[event.code]
    if (!direction) return

    event.preventDefault()
    unlockAudio()
    seekTo(currentTime() + direction * (event.shiftKey ? SEEK_STEP_LONG : SEEK_STEP))
  }

  function stopPropagation(event) {
    event.stopPropagation()
  }

  function buildControls() {
    addStyles()
    const root = R.el('div', 'kit-player', document.body)
    const big = R.el('button', 'kit-player__big', root, PLAY_ICON)
    const bar = R.el('div', 'kit-player__bar', root)
    const toggle = R.el('button', 'kit-player__button', bar)
    const scrubber = R.el('input', 'kit-player__scrubber', bar)
    const time = R.el('span', 'kit-player__time', bar)
    const sound = R.el('button', 'kit-player__button', bar)
    big.setAttribute('aria-label', 'Play')
    Object.assign(scrubber, { type: 'range', min: '0', max: String(player.duration), step: '0.01', tabIndex: -1 })
    scrubber.setAttribute('aria-label', 'Seek')
    return { root, bar, toggle, scrubber, time, sound }
  }

  function startPreview(duration) {
    player.duration = duration
    ui = buildControls()
    ui.root.addEventListener('click', handleFrameClick)
    ui.bar.addEventListener('click', stopPropagation)
    ui.toggle.addEventListener('click', handleFrameClick)
    ui.sound.addEventListener('click', handleSoundClick)
    ui.scrubber.addEventListener('pointerdown', handleScrubStart)
    ui.scrubber.addEventListener('input', handleScrubInput)
    ui.scrubber.addEventListener('pointerup', handleScrubEnd)
    ui.scrubber.addEventListener('pointercancel', handleScrubEnd)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', fitStage)
    renderSound('Sound on: click to play')
    renderState()
    renderClock(0)
    requestAnimationFrame(primeSound)
  }

  async function boot() {
    prepareStage()
    if (window.__MODE__ === 'preview') fitStage()
    if (KIT.errors.length > 0) throw kitError(KIT.errors[0])
    if (!KIT.video) throw kitError('No video was registered: call R.video({ duration, init, update }) exactly once.')

    await loadFonts()
    await decodeAssets()
    KIT.video.init(stage)
    KIT.sealed = true
    await waitForImages()
    publish(KIT.video)
    window.__seek(0)
    window.__ready = true
    if (window.__MODE__ === 'preview') startPreview(KIT.video.duration)
  }

  function fail(error) {
    KIT.sealed = true
    window.__error = describeError(error)
    console.error(error)
    if (window.__MODE__ === 'preview') showError(window.__error)
  }

  window.__ready = false
  window.__renderSoundtrack = renderSoundtrack
  window.__soundtrackChunk = soundtrackChunk
  boot().catch(fail)
})()
