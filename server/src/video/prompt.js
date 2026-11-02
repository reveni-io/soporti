export const KIT_REFERENCE_SECTION = `## Video kit reference

A video project is a web page that can draw any instant \`t\` of the video. Soporti bundles it with the kit into one HTML document and loads it in Chromium with every network request blocked: the studio preview plays it live, and the renderer draws it frame by frame (in any order, across parallel processes) and records the soundtrack the page synthesizes.

### Project files
- \`project.json\`: \`{ "title", "width", "height", "fps", "scripts": [...], "styles": [...] }\`. Sizes: 1920×1080 (16:9), 1080×1080 (1:1) or 1080×1920 (9:16). \`fps\`: 30 or 60.
- \`scripts\` are classic scripts (no \`import\`/\`export\`), run in the listed order after the kit's \`core.js\` and \`synth.js\` and before its \`runtime.js\`. They share one global scope: wrap each file in \`;(function () { 'use strict' … })()\` and share data through your own namespace on \`R\` (e.g. \`R.DATA\`). \`styles\` are CSS files applied in order.
- Text files are \`.js\`, \`.css\`, \`.json\` and \`.svg\`, with lowercase paths like \`scenes.js\` or \`ui/cards.js\`, never under \`assets/\` or \`kit/\`: at most 40 files, 400 KB each, 2 MB in total.
- Assets (fonts: woff2, woff, ttf, otf; images: svg, png, jpg, jpeg, webp, gif) belong to the video. CSS references them as \`url("assets/<name>")\` and JS as \`R.asset('<name>')\`.
- The page body is \`<div id="stage"></div>\`, sized width×height by the kit. Build everything inside it.

### Rules
- Classic scripts only, and one \`R.video(...)\` call in the whole project.
- \`update(t)\` is pure: everything on screen derives from \`t\`, so drawing the same \`t\` twice, or the frames in any order, gives the same picture. Keep no state between calls (no counters, no previous \`t\`, no accumulated physics) and write the DOM through \`R.S\`, \`R.setText\`, \`R.setHTML\`, \`R.cls\` and \`R.show\`.
- No \`Math.random\` (use \`R.rng(seed)\`), no \`setTimeout\`, \`setInterval\` or \`requestAnimationFrame\`, no \`Date\` or \`performance.now()\`, and no CSS transitions or animations: time only comes from \`t\`.
- Assets only through \`R.asset(name)\` or \`url("assets/name")\`. There is no other URL: the network is blocked.
- Every text the viewer must read goes through \`R.caption(text, from, to)\`: \`from\` is when it is fully on screen and readable, \`to\` when it starts to leave. Give each one enough time to be read at the brief's pace.
- Register a cue for every event that deserves a sound (entrances, impacts, clicks, typing, transitions): the music is written from the cues.
- Build the DOM in \`init(stage)\` and only change it in \`update(t)\`. Register cues and captions at load time or in \`init\`: after \`init\` they throw.

### Timeline (\`window.R\`)
- \`R.video({ duration, init(stage), update(t), motion(t), hints })\`: registers the video; \`duration\` in seconds. Optional \`motion(t)\` estimates the motion at \`t\` in pixels per frame and \`hints\` (\`[[from, to, subframes]]\`) forces motion-blur subframes on fast moves; without them there is no motion blur.
- \`R.cue(t, type, extra)\`: an event \`{ t, type, ...extra }\` for the sound design.
- \`R.caption(text, from, to)\`: a text the viewer must read, as plain text.
- \`R.keyTimes(text, t0, { cps = 20, seed = 1 })\`: the per-character times of someone typing \`text\` from \`t0\`, with human jitter; it registers a \`key\` cue \`{ i }\` per character. Show \`text.slice(0, times.filter(k => k <= t).length)\`.
- \`R.asset(name)\`: the asset's data URL.
- \`R.music(fn)\`: the soundtrack, see Music.
- \`R.W\`, \`R.H\`, \`R.FPS\`: the project's size and frame rate. \`R.CUES\` and \`R.CAPTIONS\`: what has been registered so far.

### Animation helpers
- \`R.clamp(x, a = 0, b = 1)\`, \`R.lerp(a, b, p)\`, \`R.prog(t, a, b)\` (progress 0→1 of \`t\` from \`a\` to \`b\`, clamped) and \`R.loglerp(a, b, p)\` (for zoom and scale).
- \`R.E\`: easings \`linear\`, \`inQuad\`, \`outQuad\`, \`inOutQuad\`, \`inCubic\`, \`outCubic\`, \`inOutCubic\`, \`inQuart\`, \`outQuart\`, \`inOutQuart\`, \`outQuint\`, \`inOutQuint\`, \`inExpo\`, \`outExpo\`, \`inOutExpo\`, \`inSine\`, \`outSine\`, \`inOutSine\`, \`inBack\`, \`outBack\`, \`outBackSoft\`, and the curves \`whip\`, \`snap\`, \`glide\`, \`ui\`, \`move\`. Usage: \`R.E.outCubic(R.prog(t, 1.2, 1.8))\`.
- \`R.bezier(x1, y1, x2, y2)\`: an easing like CSS \`cubic-bezier\`.
- \`R.spring(dt, f = 3, z = 0.5)\`: a 0→1 spring that overshoots, \`dt\` seconds after its trigger (\`f\` in Hz, \`z\` damping).
- \`R.keyframes(keys, t, fields)\`: \`{ field: value }\` at \`t\`, interpolated between \`[{ t, ...fields, e }]\`, where \`e\` is the easing into that key (default \`inOutCubic\`); fields named \`k\` or \`z\` interpolate logarithmically. \`R.fillKeys(keys, fields)\` copies each missing field from the previous key.
- \`R.opacityOf(t, [a, b, c, d])\`: fades in from \`a\` to \`b\`, holds, fades out from \`c\` to \`d\`.
- \`R.blink(t, since, period = 1.06)\`: a text caret, 1 or 0.
- \`R.rng(seed)\`: a deterministic generator of numbers in [0, 1). \`R.hash1(n)\`: a hash in [0, 1). \`R.vnoise(x, seed = 0)\`: smooth noise in [-1, 1].
- \`R.tf(x, y, s = 1, r = 0)\`: a CSS transform (pixels, scale, radians).

### DOM helpers (writes are cached, so call them every frame)
- \`R.el(tag, className, parent, html)\`: creates an element and appends it to \`parent\`.
- \`R.S(node, prop, value)\` sets \`node.style[prop]\` only when it changed; \`R.show(node, visible)\`, \`R.setText(node, text)\`, \`R.setHTML(node, html)\` and \`R.cls(node, className, on)\` work the same way.
- \`R.splitWords(html)\` wraps each word in \`<span class="wm"><span class="w">…</span></span>\` and keeps \`<em>\`, \`<br>\` and \`<code>\`: insert it, then animate the \`.w\` spans for word-by-word reveals.

### Music (\`window.SYNTH\`)
\`R.music(function (S, { cues, duration, sampleRate }) { … })\` writes the arrangement into the buses. It runs once, in the page, at 48 kHz, and the kit masters it: bus mix, kick sidechain ducking, reverb and delay returns, compressor, peak normalization and a short fade-out.
- \`S.put(buffer, t, bus, { gain = 1, pan = 0, verb = 0, dly = 0, duck })\` mixes a sound at \`t\` into a bus: \`drums\`, \`bass\`, \`pad\`, \`lead\` or \`sfx\` (\`S.BUSES\`). \`verb\` and \`dly\` are the reverb and ping-pong delay sends. A \`kick\` ducks the pad, bass and lead unless \`duck: false\`.
- \`S.gap(from, to)\` cuts the dry mix, a breath before an impact.
- \`S.tempo({ from, to, bar = 2.5, beats = 4 })\` fits a whole number of bars of about \`bar\` seconds between two times (two cues), so the hits land on downbeats; \`S.tempo({ bpm, from })\` keeps a fixed tempo. It returns \`{ beat, bar, bpm, bars, from, at(barIndex, beatIndex = 0) }\`.
- \`S.cueTime(cues, type, index = 0)\`: the time of a cue; it throws when there is none.
- Drums: \`kick(vel = 1, len = 0.55, punch = 1)\`, \`snare(vel = 1, pitch = 1)\`, \`clap(vel = 1)\`, \`hat(vel = 1, decay = 0.034)\` (0.13 for an open hat), \`crash(len = 2.4, vel = 1)\`, \`boom(f0 = 70, f1 = 31, len = 2.2, vel = 1)\` (a sub drop).
- Tonal: \`bassNote(midi, len, vel = 1)\`, \`padChord(midis, len, { attack, release, width, cutoff(t) })\` (stereo), \`pluck(midi, len = 0.7, { ratio, index, decay, modDecay })\`, \`bell(midi, len = 2.2, vel = 1)\`.
- Effects: \`riser(len, f0 = 250, f1 = 9000, vel = 1)\`, \`whoosh(len = 0.6, dir = 1, vel = 1, peak = 0.55)\` (stereo), \`sweep(f0, f1, len, vel = 1)\`, \`air(len, vel = 1, f0 = 800, f1 = 6000)\`, \`blip(f = 1300, len = 0.07, vel = 1, rise = 0.4)\`, \`click(vel = 1, f = 2600)\`, \`key(seed)\` (one keystroke), \`pop(f = 420, vel = 1)\`, \`thump(f = 110, vel = 1)\`.
- Tools: \`mtof(midi)\`, \`buf(seconds)\` (a mono Float32Array), \`filt(buffer, type, freq, q = 0.707)\` (in place; \`type\` is \`lp\`, \`hp\` or \`bp\`, \`freq\` a number or a function of time), \`reversed(buffer, fade = 0.02)\`, \`rand()\` and \`noise()\` (seeded), \`panGains(pan)\`, \`polyblep(phase, dt)\`, \`TAU\`.
- Levels that work: sound effects at 0.05–0.3 gain on \`sfx\`, melodic hits at 0.05–0.15 on \`lead\`, pads at about 0.5. Leave headroom: the master normalizes.`
