;(function () {
  'use strict'

  const { clamp, lerp, rng } = window.R
  const TAU = Math.PI * 2
  const DEFAULT_SAMPLE_RATE = 48000
  const RANDOM_SEED = 20261027
  const TAIL_SECONDS = 0.6
  const EDGE_FADE_SECONDS = 0.004
  const FILTER_TYPES = ['lp', 'hp', 'bp']
  const FILTER_UPDATE_INTERVAL = 16
  const BUS_NAMES = ['drums', 'bass', 'pad', 'lead', 'sfx']
  const SEND_NAMES = ['verb', 'dly']
  const BUS_GAINS = { drums: 0.8, bass: 0.62, pad: 0.6, lead: 0.95, sfx: 1 }
  const RETURN_GAINS = { reverb: 0.34, echo: 0.3, echoReverb: 0.3 }
  const DUCK = { pad: [0.5, 0.16], bass: [0.7, 0.12], lead: [0.28, 0.16] }
  const DUCK_ATTACK = 0.004
  const GAP_RAMP = 0.006
  const GAP_ROOM_FLOOR = 0.25
  const HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0].map(f => f * 1.72)
  const CLAP_OFFSETS = [0, 0.0105, 0.021, 0.0315]
  const CRASH_PARTIALS = [3170, 4230, 5410, 6890, 8120, 9460]
  const PAD_DETUNE = [-15, -7, 0, 7, 15]
  const PAD_PANS = [-0.85, -0.4, 0, 0.4, 0.85]
  const COMB_TUNINGS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
  const ALLPASS_TUNINGS = [556, 441, 341, 225]
  const REVERB_SPREAD = 23
  const REVERB_PREDELAY = 0.018
  const REVERB_INPUT = 0.015
  const REVERB_OUTPUT = 3
  const REVERB = { room: 0.86, damp: 0.28, gain: 1 }
  const ECHO_REVERB = { room: 0.8, damp: 0.4, gain: 0.3 }
  const ECHO = { time: 0.1875, feedback: 0.38, damp: 0.35 }
  const HIGHPASS_HZ = 26
  const COMPRESSOR = { threshold: 0.6, ratio: 2.6, attack: 0.3, release: 0.0004 }
  const OUTPUT_LEVEL = 0.67
  const SOFT_CLIP_DRIVE = 1.1
  const OUTPUT_CEILING = 0.95
  const FADE_OUT = { lead: 0.42, length: 0.4 }
  const DEFAULT_BAR_SECONDS = 2.5

  let sampleRate = DEFAULT_SAMPLE_RATE
  let random = rng(RANDOM_SEED)
  let session = null

  function rand() {
    return random()
  }

  function noise() {
    return random() * 2 - 1
  }

  function mtof(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12)
  }

  function buf(seconds) {
    return new Float32Array(Math.max(1, Math.floor(seconds * sampleRate)))
  }

  function stereo(frames) {
    return { L: new Float32Array(frames), R: new Float32Array(frames) }
  }

  function panGains(pan) {
    const angle = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4
    return [Math.cos(angle) * Math.SQRT2, Math.sin(angle) * Math.SQRT2]
  }

  function wrap(phase) {
    return phase >= 1 ? phase - 1 : phase
  }

  function polyblep(phase, dt) {
    if (phase < dt) {
      const x = phase / dt
      return x + x - x * x - 1
    }
    if (phase > 1 - dt) {
      const x = (phase - 1) / dt
      return x * x + x + x + 1
    }
    return 0
  }

  function setCoefficients(c, type, frequency, q) {
    const w0 = (TAU * clamp(frequency, 10, sampleRate * 0.45)) / sampleRate
    const cw = Math.cos(w0)
    const alpha = Math.sin(w0) / (2 * q)
    const a0 = 1 + alpha
    let b0 = alpha
    let b1 = 0
    let b2 = -alpha
    if (type === 'lp') {
      b0 = (1 - cw) / 2
      b1 = 1 - cw
      b2 = b0
    }
    if (type === 'hp') {
      b0 = (1 + cw) / 2
      b1 = -(1 + cw)
      b2 = b0
    }
    c[0] = b0 / a0
    c[1] = b1 / a0
    c[2] = b2 / a0
    c[3] = (-2 * cw) / a0
    c[4] = (1 - alpha) / a0
  }

  function filt(buffer, type, frequency, q = 0.707) {
    if (!FILTER_TYPES.includes(type)) throw new Error(`SYNTH.filt(): type must be one of ${FILTER_TYPES.join(', ')}.`)

    const dynamic = typeof frequency === 'function'
    const c = new Float64Array(5)
    let x1 = 0
    let x2 = 0
    let y1 = 0
    let y2 = 0
    setCoefficients(c, type, dynamic ? frequency(0) : frequency, q)
    for (let k = 0; k < buffer.length; k++) {
      if (dynamic && k % FILTER_UPDATE_INTERVAL === 0) setCoefficients(c, type, frequency(k / sampleRate), q)
      const x = buffer[k]
      const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2
      x2 = x1
      x1 = x
      y2 = y1
      y1 = y
      buffer[k] = y
    }
    return buffer
  }

  function reversed(buffer, fade = 0.02) {
    const out = Float32Array.from(buffer).reverse()
    const length = Math.floor(fade * sampleRate)
    for (let k = 0; k < length; k++) out[k] *= k / length
    return out
  }

  function kick(vel = 1, len = 0.55, punch = 1) {
    const b = buf(len)
    let phase = 0
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      const f = 46 + 160 * punch * Math.exp(-t / 0.026) + 26 * Math.exp(-t / 0.14)
      phase += f / sampleRate
      const env = Math.exp(-t / 0.3) * Math.min(1, t / 0.0012)
      const transient = t < 0.005 ? noise() * (1 - t / 0.005) * 0.55 : 0
      b[k] = Math.tanh(1.5 * (Math.sin(TAU * phase) * env + transient * 0.35)) * vel
    }
    b.kick = true
    return b
  }

  function clapEnvelope(t) {
    let e = 0
    for (const offset of CLAP_OFFSETS) if (t >= offset) e = Math.max(e, Math.exp(-(t - offset) / 0.005))
    const tail = t > 0.0315 ? 0.75 * Math.exp(-(t - 0.0315) / 0.12) : 0
    return Math.max(e, tail)
  }

  function clap(vel = 1) {
    const b = buf(0.4)
    for (let k = 0; k < b.length; k++) b[k] = noise() * clapEnvelope(k / sampleRate) * vel
    filt(b, 'bp', 1450, 0.85)
    filt(b, 'hp', 520, 0.7)
    return b
  }

  function hat(vel = 1, decay = 0.034) {
    const b = buf(decay * 7)
    const phases = HAT_FREQS.map(() => random())
    const steps = HAT_FREQS.map(f => f / sampleRate)
    for (let k = 0; k < b.length; k++) {
      let metal = 0
      for (let i = 0; i < phases.length; i++) {
        phases[i] = wrap(phases[i] + steps[i])
        metal += phases[i] < 0.5 ? 1 : -1
      }
      b[k] = (metal / 6 + noise() * 0.7) * Math.exp(-(k / sampleRate) / decay) * vel
    }
    filt(b, 'bp', 10500, 0.6)
    filt(b, 'hp', 7200, 0.7)
    return b
  }

  function snare(vel = 1, pitch = 1) {
    const b = buf(0.3)
    const rattle = buf(0.3)
    let phase = 0
    for (let k = 0; k < rattle.length; k++) rattle[k] = noise() * Math.exp(-(k / sampleRate) / 0.11)
    filt(rattle, 'bp', 3200 * pitch, 0.55)
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      phase += (185 * pitch * (1 + 0.5 * Math.exp(-t / 0.01))) / sampleRate
      b[k] = (Math.sin(TAU * phase) * Math.exp(-t / 0.045) * 0.6 + rattle[k] * 1.1) * vel
    }
    return b
  }

  function crash(len = 2.4, vel = 1) {
    const b = buf(len)
    const partials = CRASH_PARTIALS.map(f => ({ f, phase: random() }))
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      let metal = 0
      for (const partial of partials) metal += Math.sin(TAU * (partial.phase + partial.f * t)) * 0.12
      b[k] = (noise() * 0.8 + metal) * Math.exp(-t / 0.75) * Math.min(1, t / 0.002) * vel
    }
    filt(b, 'hp', 3800, 0.6)
    return b
  }

  function boom(f0 = 70, f1 = 31, len = 2.2, vel = 1) {
    const b = buf(len)
    let phase = 0
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      phase += (f1 + (f0 - f1) * Math.exp(-t / 0.18)) / sampleRate
      b[k] = Math.tanh(1.3 * Math.sin(TAU * phase)) * Math.exp(-t / 0.75) * Math.min(1, t / 0.004) * vel
    }
    return b
  }

  function bassEnvelope(t, len) {
    const release = t > len ? Math.exp(-(t - len) / 0.012) : 1
    return Math.min(1, t / 0.003) * release * (0.75 + 0.25 * Math.exp(-t / 0.08))
  }

  function bassNote(midi, len, vel = 1) {
    const b = buf(len + 0.05)
    const dt = mtof(midi) / sampleRate
    let phase = 0
    let sub = 0
    for (let k = 0; k < b.length; k++) {
      phase = wrap(phase + dt)
      sub = wrap(sub + dt / 2)
      const saw = 2 * phase - 1 - polyblep(phase, dt)
      b[k] = (saw * 0.55 + Math.sin(TAU * sub) * 0.7) * bassEnvelope(k / sampleRate, len) * vel
    }
    filt(b, 'lp', t => 170 + 1100 * Math.exp(-t / 0.075), 1.1)
    return b
  }

  function addSawVoice(target, frequency, gains) {
    const dt = frequency / sampleRate
    let phase = random()
    for (let k = 0; k < target.L.length; k++) {
      phase = wrap(phase + dt)
      const s = (2 * phase - 1 - polyblep(phase, dt)) * 0.09
      target.L[k] += s * gains[0]
      target.R[k] += s * gains[1]
    }
  }

  function padChord(midis, len, options = {}) {
    const { attack = 0.35, release = 1.0, width = 1, cutoff = () => 1800 } = options
    const frames = buf(len + release).length
    const out = stereo(frames)
    for (const midi of midis) {
      PAD_DETUNE.forEach((cents, voice) => {
        addSawVoice(out, mtof(midi) * Math.pow(2, cents / 1200), panGains(PAD_PANS[voice] * width))
      })
    }
    filt(out.L, 'lp', cutoff, 0.8)
    filt(out.R, 'lp', cutoff, 0.8)
    for (let k = 0; k < frames; k++) {
      const t = k / sampleRate
      const env = Math.min(1, t / attack) * (t > len ? Math.exp(-(t - len) / (release / 3)) : 1)
      out.L[k] *= env
      out.R[k] *= env
    }
    return out
  }

  function pluck(midi, len = 0.7, options = {}) {
    const { ratio = 2, index = 2.2, decay = 0.28, modDecay = 0.09 } = options
    const b = buf(len)
    const f = mtof(midi)
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      const mod = Math.sin(TAU * f * ratio * t) * index * Math.exp(-t / modDecay)
      b[k] = Math.sin(TAU * f * t + mod) * Math.exp(-t / decay) * Math.min(1, t / 0.002)
    }
    return b
  }

  function bell(midi, len = 2.2, vel = 1) {
    const b = buf(len)
    const f = mtof(midi)
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      const mod = Math.sin(TAU * f * 3.5 * t) * 2.4 * Math.exp(-t / 0.35)
      const tone =
        Math.sin(TAU * f * t + mod) * Math.exp(-t / 0.7) + 0.35 * Math.sin(TAU * f * 2 * t) * Math.exp(-t / 0.3)
      b[k] = tone * Math.min(1, t / 0.002) * vel
    }
    return b
  }

  function riser(len, f0 = 250, f1 = 9000, vel = 1) {
    const b = buf(len)
    const tone = buf(len)
    let phase = 0
    for (let k = 0; k < b.length; k++) {
      const p = k / sampleRate / len
      b[k] = noise() * Math.pow(p, 2.2)
      phase += (lerp(110, 880, p * p) / sampleRate) % 1
      tone[k] = (2 * (phase % 1) - 1) * Math.pow(p, 3) * 0.25
    }
    filt(b, 'bp', t => f0 * Math.pow(f1 / f0, Math.pow(t / len, 1.4)), 2.2)
    filt(tone, 'lp', t => 400 + 5000 * (t / len), 0.9)
    for (let k = 0; k < b.length; k++) b[k] = (b[k] * 1.3 + tone[k]) * vel
    return b
  }

  function whoosh(len = 0.6, dir = 1, vel = 1, peak = 0.55) {
    const out = stereo(buf(len).length)
    const air = buf(len)

    function swell(t) {
      const p = t / len
      return p < peak ? Math.pow(p / peak, 2.2) : Math.pow(1 - (p - peak) / (1 - peak), 1.8)
    }

    for (let k = 0; k < air.length; k++) air[k] = noise()
    filt(air, 'bp', t => 380 + 3200 * swell(t), 1.3)
    filt(air, 'lp', t => 1200 + 7000 * swell(t), 0.7)
    for (let k = 0; k < air.length; k++) {
      const t = k / sampleRate
      const [gl, gr] = panGains(dir * lerp(-0.9, 0.9, t / len))
      const v = air[k] * swell(t) * vel * 1.6
      out.L[k] = v * gl
      out.R[k] = v * gr
    }
    return out
  }

  function blip(f = 1300, len = 0.07, vel = 1, rise = 0.4) {
    const b = buf(len)
    let phase = 0
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      phase += (f * (1 + rise * (1 - Math.exp(-t / 0.01)))) / sampleRate
      b[k] = Math.sin(TAU * phase) * Math.exp(-t / 0.014) * Math.min(1, t / 0.0008) * vel
    }
    return b
  }

  function click(vel = 1, f = 2600) {
    const b = buf(0.03)
    for (let k = 0; k < b.length; k++) b[k] = noise() * Math.exp(-(k / sampleRate) / 0.0018) * vel
    filt(b, 'bp', f, 1.2)
    return b
  }

  function key(seed = 0) {
    const pitch = rng(seed * 977 + 13)
    const b = buf(0.06)
    const f = 1900 + pitch() * 1400
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      b[k] = noise() * Math.exp(-t / 0.0022) * 0.8 + Math.sin(TAU * 170 * t) * Math.exp(-t / 0.009) * 0.5
    }
    filt(b, 'bp', f, 0.9)
    return b
  }

  function pop(f = 420, vel = 1) {
    const b = buf(0.18)
    let phase = 0
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      phase += (f * (1 + 1.6 * Math.exp(-t / 0.011))) / sampleRate
      b[k] = (Math.sin(TAU * phase) * Math.exp(-t / 0.05) + noise() * 0.25 * Math.exp(-t / 0.004)) * vel
    }
    return b
  }

  function thump(f = 110, vel = 1) {
    const b = buf(0.22)
    const knock = buf(0.22)
    let phase = 0
    for (let k = 0; k < knock.length; k++) knock[k] = noise() * Math.exp(-(k / sampleRate) / 0.02)
    filt(knock, 'bp', 1800, 0.7)
    for (let k = 0; k < b.length; k++) {
      const t = k / sampleRate
      phase += (f * (1 + 0.8 * Math.exp(-t / 0.015))) / sampleRate
      b[k] = (Math.sin(TAU * phase) * Math.exp(-t / 0.07) + knock[k] * 0.25) * vel
    }
    return b
  }

  function sweep(f0, f1, len, vel = 1) {
    const b = buf(len)
    let phase = 0
    for (let k = 0; k < b.length; k++) {
      const p = k / sampleRate / len
      phase += (f0 * Math.pow(f1 / f0, p)) / sampleRate
      const fm = Math.sin(TAU * phase * 2.01) * 1.2 * (1 - p)
      b[k] = Math.sin(TAU * phase + fm) * Math.sin(Math.PI * p) * vel
    }
    return b
  }

  function air(len, vel = 1, f0 = 800, f1 = 6000) {
    const b = buf(len)
    for (let k = 0; k < b.length; k++) b[k] = noise() * Math.sin((Math.PI * k) / b.length) * vel
    filt(b, 'bp', t => f0 * Math.pow(f1 / f0, t / len), 0.9)
    return b
  }

  function requireSession(name) {
    if (!session) throw new Error(`${name} only works inside the R.music() arrangement.`)
    return session
  }

  function busNamed(name) {
    const { buses } = requireSession('SYNTH.put()')
    if (!BUS_NAMES.includes(name)) throw new Error(`SYNTH.put(): unknown bus "${name}", use ${BUS_NAMES.join(', ')}.`)
    return buses[name]
  }

  function mixVoice(voice, target, gainL, gainR) {
    const { left, right, start } = voice
    const length = left.length
    const fade = Math.min(length, Math.round(EDGE_FADE_SECONDS * sampleRate))
    const from = Math.max(0, -start)
    const to = Math.min(length, target.L.length - start)
    for (let k = from; k < to; k++) {
      const edge = k >= length - fade ? (length - k) / fade : 1
      target.L[start + k] += left[k] * gainL * edge
      target.R[start + k] += right[k] * gainR * edge
    }
  }

  function put(buffer, t, busName, options = {}) {
    const target = busNamed(busName)
    const { gain = 1, pan = 0, verb = 0, dly = 0, duck = buffer.kick === true } = options
    const [gl, gr] = panGains(pan)
    const voice = { left: buffer.L || buffer, right: buffer.R || buffer, start: Math.round(t * sampleRate) }
    mixVoice(voice, target, gain * gl, gain * gr)
    if (verb) mixVoice(voice, session.buses.verb, gain * gl * verb, gain * gr * verb)
    if (dly) mixVoice(voice, session.buses.dly, gain * gl * dly, gain * gr * dly)
    if (duck) session.kicks.push(t)
  }

  function gap(from, to) {
    requireSession('SYNTH.gap()').gaps.push([from, to])
  }

  function lockedBeat(options, beats) {
    const { from = 0, to, bar = DEFAULT_BAR_SECONDS } = options
    if (!(to > from)) throw new Error('SYNTH.tempo(): pass { bpm } or { from, to } with to > from.')

    const bars = Math.max(1, Math.round((to - from) / bar))
    return (to - from) / bars / beats
  }

  function tempo(options) {
    const { from = 0, beats = 4, bpm } = options
    const beat = bpm ? 60 / bpm : lockedBeat(options, beats)
    const bar = beat * beats
    return {
      from,
      beat,
      bar,
      bpm: 60 / beat,
      bars: options.to === undefined ? null : Math.round((options.to - from) / bar),
      at(barIndex, beatIndex = 0) {
        return from + barIndex * bar + beatIndex * beat
      },
    }
  }

  function cueTime(cues, type, index = 0) {
    const matches = cues.filter(c => c.type === type)
    if (index >= matches.length) throw new Error(`SYNTH.cueTime(): there is no "${type}" cue #${index}.`)
    return matches[index].t
  }

  function combPass(input, output, options) {
    const { length, room, damp } = options
    const line = new Float32Array(length)
    let index = 0
    let store = 0
    for (let i = 0; i < input.length; i++) {
      const y = line[index]
      store = y * (1 - damp) + store * damp
      line[index] = input[i] + store * room
      index = index + 1 === length ? 0 : index + 1
      output[i] += y
    }
  }

  function allpassPass(signal, length) {
    const line = new Float32Array(length)
    let index = 0
    for (let i = 0; i < signal.length; i++) {
      const delayed = line[index]
      const x = signal[i]
      line[index] = x + delayed * 0.5
      signal[i] = delayed - x
      index = index + 1 === length ? 0 : index + 1
    }
  }

  function reverbChannel(input, spread, options) {
    const scale = sampleRate / 44100
    const out = new Float32Array(input.length)
    for (const tuning of COMB_TUNINGS) {
      combPass(input, out, { length: Math.round((tuning + spread) * scale), room: options.room, damp: options.damp })
    }
    for (const tuning of ALLPASS_TUNINGS) allpassPass(out, Math.round((tuning + spread) * scale))
    for (let i = 0; i < out.length; i++) out[i] *= REVERB_OUTPUT
    return out
  }

  function freeverb(input, options) {
    const frames = input.L.length
    const predelay = Math.round(REVERB_PREDELAY * sampleRate)
    const mono = new Float32Array(frames)
    const gain = REVERB_INPUT * options.gain
    for (let i = predelay; i < frames; i++) mono[i] = (input.L[i - predelay] + input.R[i - predelay]) * gain
    return { L: reverbChannel(mono, 0, options), R: reverbChannel(mono, REVERB_SPREAD, options) }
  }

  function pingpong(input) {
    const frames = input.L.length
    const delay = Math.round(ECHO.time * sampleRate)
    const out = stereo(frames)
    let lowL = 0
    let lowR = 0
    for (let i = delay; i < frames; i++) {
      lowL = lowL * ECHO.damp + out.R[i - delay] * (1 - ECHO.damp)
      lowR = lowR * ECHO.damp + out.L[i - delay] * (1 - ECHO.damp)
      out.L[i] = (input.L[i - delay] + input.R[i - delay]) * 0.5 + lowL * ECHO.feedback
      out.R[i] = lowR * ECHO.feedback
    }
    return out
  }

  function duckGain(sinceKick, [depth, release]) {
    const attack = Math.min(1, sinceKick / DUCK_ATTACK)
    return 1 - depth * attack * Math.exp(-sinceKick / release)
  }

  function gapGain(t, gaps) {
    for (const [from, to] of gaps) {
      if (t >= from - GAP_RAMP && t < to) return 1 - clamp((t - (from - GAP_RAMP)) / GAP_RAMP)
    }
    return 1
  }

  function lastKickBefore(sidechain, t) {
    const { kicks } = sidechain
    while (sidechain.next < kicks.length && kicks[sidechain.next] <= t) {
      sidechain.last = kicks[sidechain.next]
      sidechain.next += 1
    }
    return sidechain.last
  }

  function mixSample(tracks, i, gains) {
    const dry =
      tracks.drums[i] * BUS_GAINS.drums +
      tracks.bass[i] * BUS_GAINS.bass * gains.bass +
      tracks.pad[i] * BUS_GAINS.pad * gains.pad +
      tracks.lead[i] * BUS_GAINS.lead * gains.lead +
      tracks.sfx[i] * BUS_GAINS.sfx
    const room =
      tracks.reverb[i] * RETURN_GAINS.reverb * gains.pad +
      tracks.echo[i] * RETURN_GAINS.echo * gains.lead +
      tracks.echoReverb[i] * RETURN_GAINS.echoReverb
    return dry * gains.cut + room * gains.room
  }

  function mixdown(sources, mix, sidechain) {
    const left = channelTracks(sources, 'L')
    const right = channelTracks(sources, 'R')
    const gains = { pad: 1, bass: 1, lead: 1, cut: 1, room: 1 }
    const kicks = { kicks: sidechain.kicks, next: 0, last: -Infinity }
    for (let i = 0; i < mix.L.length; i++) {
      const t = i / sampleRate
      const sinceKick = t - lastKickBefore(kicks, t)
      gains.pad = duckGain(sinceKick, DUCK.pad)
      gains.bass = duckGain(sinceKick, DUCK.bass)
      gains.lead = duckGain(sinceKick, DUCK.lead)
      gains.cut = gapGain(t, sidechain.gaps)
      gains.room = gains.cut < 1 ? Math.max(gains.cut, GAP_ROOM_FLOOR) : 1
      mix.L[i] = mixSample(left, i, gains)
      mix.R[i] = mixSample(right, i, gains)
    }
  }

  function channelTracks(sources, channel) {
    const tracks = {}
    for (const name of BUS_NAMES) tracks[name] = sources.buses[name][channel]
    tracks.reverb = sources.reverb[channel]
    tracks.echo = sources.echo[channel]
    tracks.echoReverb = sources.echoReverb[channel]
    return tracks
  }

  function compress(mix) {
    let env = 0
    for (let i = 0; i < mix.L.length; i++) {
      const level = Math.max(Math.abs(mix.L[i]), Math.abs(mix.R[i]))
      env += (level - env) * (level > env ? COMPRESSOR.attack : COMPRESSOR.release)
      const over =
        env > COMPRESSOR.threshold ? COMPRESSOR.threshold + (env - COMPRESSOR.threshold) / COMPRESSOR.ratio : env
      const gain = env > 1e-6 ? over / env : 1
      mix.L[i] *= gain
      mix.R[i] *= gain
    }
  }

  function peakOf(left, right) {
    let peak = 0
    for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
    return peak
  }

  function shapeChannel(source, output) {
    const { frames, norm, duration } = output
    const out = new Float32Array(frames)
    const ceiling = OUTPUT_CEILING / Math.tanh(SOFT_CLIP_DRIVE)
    for (let i = 0; i < frames; i++) {
      const fade = 1 - clamp((i / sampleRate - (duration - FADE_OUT.lead)) / FADE_OUT.length)
      out[i] = Math.tanh(source[i] * norm * SOFT_CLIP_DRIVE) * ceiling * fade
    }
    return out
  }

  function begin(options) {
    const frames = Math.ceil(options.sampleRate * (options.duration + TAIL_SECONDS))
    const buses = {}
    for (const name of [...BUS_NAMES, ...SEND_NAMES]) buses[name] = stereo(frames)
    sampleRate = options.sampleRate
    random = rng(RANDOM_SEED)
    session = { duration: options.duration, frames, buses, kicks: [], gaps: [] }
  }

  function master() {
    const { buses, frames, duration, kicks, gaps } = requireSession('SYNTH.master()')
    const echo = pingpong(buses.dly)
    const sources = { buses, echo, reverb: freeverb(buses.verb, REVERB), echoReverb: freeverb(echo, ECHO_REVERB) }
    const mix = stereo(frames)
    mixdown(sources, mix, { kicks: kicks.slice().sort((a, b) => a - b), gaps })
    session = null
    filt(mix.L, 'hp', HIGHPASS_HZ, 0.7)
    filt(mix.R, 'hp', HIGHPASS_HZ, 0.7)
    compress(mix)

    const level = peakOf(mix.L, mix.R)
    const output = { frames: Math.round(duration * sampleRate), norm: level > 0 ? OUTPUT_LEVEL / level : 0, duration }
    const left = shapeChannel(mix.L, output)
    const right = shapeChannel(mix.R, output)
    return { sampleRate, left, right, peak: peakOf(left, right) }
  }

  window.SYNTH = {
    TAU,
    BUSES: BUS_NAMES,
    mtof,
    rand,
    noise,
    buf,
    panGains,
    polyblep,
    filt,
    reversed,
    kick,
    clap,
    hat,
    snare,
    crash,
    boom,
    bassNote,
    padChord,
    pluck,
    bell,
    riser,
    whoosh,
    blip,
    click,
    key,
    pop,
    thump,
    sweep,
    air,
    put,
    gap,
    tempo,
    cueTime,
    begin,
    master,
  }
})()
