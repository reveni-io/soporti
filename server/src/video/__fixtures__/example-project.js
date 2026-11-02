const PROJECT = {
  title: 'Kit example',
  width: 1920,
  height: 1080,
  fps: 30,
  scripts: ['scenes.js', 'music.js'],
  styles: ['style.css'],
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <circle cx="80" cy="80" r="72" fill="#6ce869"/>
  <path d="M50 84l20 20 40-46" fill="none" stroke="#06140c" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`

const STYLE_CSS = `#stage {
  background: radial-gradient(circle at 30% 20%, #17402a, #06140c 70%);
  color: #f2f7f1;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}

.title {
  position: absolute;
  left: 160px;
  top: 330px;
  margin: 0;
  font-size: 120px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.word {
  display: inline-block;
  margin-right: 0.25em;
}

.word--accent {
  color: #6ce869;
}

.caption {
  position: absolute;
  left: 164px;
  top: 560px;
  margin: 0;
  font-size: 52px;
  color: rgba(242, 247, 241, 0.82);
}

.logo {
  position: absolute;
  left: 0;
  top: 0;
  width: 220px;
  height: 220px;
}
`

const SCENES_JS = `;(function () {
  'use strict'

  const T = { title: 0.4, logo: 1.4, land: 2, caption: 2.4, out: 6, end: 7 }
  const WORDS = ['Made', 'with', 'the', 'video', 'kit']
  const CAPTION = 'Every frame comes from t.'
  const LOGO_FIELDS = ['x', 'y', 's', 'r']
  const LOGO_KEYS = R.fillKeys(
    [
      { t: T.logo, x: 2000, y: 280, s: 0.6, r: 0.8 },
      { t: T.land, x: 1480, y: 300, s: 1, r: 0, e: R.E.outBack },
      { t: T.out },
      { t: T.out + 0.6, y: -320, s: 0.8, e: R.E.inCubic },
    ],
    LOGO_FIELDS
  )
  const view = {}

  R.cue(T.title, 'open')
  R.cue(T.land, 'pop')
  R.cue(T.out, 'outro')
  R.caption(WORDS.join(' '), T.title + 1.1, T.out)
  R.caption(CAPTION, T.caption + 0.6, T.out)

  function init(stage) {
    view.title = R.el('h1', 'title', stage)
    view.words = WORDS.map(function (word, i) {
      return R.el('span', i >= 3 ? 'word word--accent' : 'word', view.title, word)
    })
    view.caption = R.el('p', 'caption', stage, CAPTION)
    view.logo = R.el('img', 'logo', stage)
    view.logo.src = R.asset('logo.svg')
  }

  function updateWord(word, i, t) {
    const start = T.title + i * 0.1
    const p = R.E.outQuart(R.prog(t, start, start + 0.7))
    const out = R.E.inCubic(R.prog(t, T.out, T.out + 0.5))
    R.S(word, 'transform', R.tf(0, (1 - p) * 60 - out * 40))
    R.S(word, 'opacity', String(p * (1 - out)))
  }

  function update(t) {
    view.words.forEach(function (word, i) {
      updateWord(word, i, t)
    })
    const logo = R.keyframes(LOGO_KEYS, t, LOGO_FIELDS)
    R.S(view.logo, 'transform', R.tf(logo.x, logo.y, logo.s, logo.r))
    R.S(view.caption, 'opacity', String(R.opacityOf(t, [T.caption, T.caption + 0.6, T.out, T.out + 0.5])))
  }

  function motion(t) {
    const a = R.keyframes(LOGO_KEYS, t, LOGO_FIELDS)
    const b = R.keyframes(LOGO_KEYS, t + 1 / R.FPS, LOGO_FIELDS)
    return Math.hypot(b.x - a.x, b.y - a.y)
  }

  R.video({ duration: T.end, init: init, update: update, motion: motion, hints: [[T.logo, T.land, 6]] })
})()
`

const MUSIC_JS = `;(function () {
  'use strict'

  const PAD = [50, 57, 62, 66, 69]
  const ROOT = 26

  R.music(function (S, context) {
    const open = S.cueTime(context.cues, 'open')
    const pop = S.cueTime(context.cues, 'pop')
    const outro = S.cueTime(context.cues, 'outro')
    const grid = S.tempo({ from: open, to: pop, bar: 2 })

    S.put(S.padChord(PAD, context.duration - 1, { attack: 1.2, release: 0.9 }), 0, 'pad', { gain: 0.5, verb: 0.4 })
    S.put(S.riser(pop - open, 250, 8000, 0.4), open, 'sfx', { gain: 0.8, verb: 0.25 })
    S.put(S.boom(66, 30, 2.2, 1), pop, 'bass', { gain: 0.8 })
    S.put(S.crash(2.4, 0.8), pop, 'drums', { gain: 0.3, pan: 0.1, verb: 0.4 })
    S.put(S.pop(560, 0.9), pop, 'sfx', { gain: 0.3, verb: 0.2 })
    S.put(S.bell(81, 2.2, 0.7), pop, 'lead', { gain: 0.12, verb: 0.5, dly: 0.25 })

    for (let t = pop; t < outro - 0.01; t += grid.beat) {
      S.put(S.kick(0.85), t, 'drums', { gain: 0.9 })
      S.put(S.bassNote(ROOT, grid.beat * 0.7, 0.8), t, 'bass', { gain: 0.5 })
      S.put(S.hat(0.5), t + grid.beat / 2, 'drums', { gain: 0.3, pan: 0.2 })
    }

    S.put(S.whoosh(0.6, -1, 0.7, 0.5), outro - 0.15, 'sfx', { gain: 0.3, verb: 0.15 })
    S.put(S.bell(86, 2.4, 0.6), outro, 'lead', { gain: 0.1, verb: 0.55, dly: 0.25 })
  })
})()
`

export const exampleProjectFixture = {
  files: {
    'project.json': `${JSON.stringify(PROJECT, null, 2)}\n`,
    'style.css': STYLE_CSS,
    'scenes.js': SCENES_JS,
    'music.js': MUSIC_JS,
  },
  assets: {
    'logo.svg': { mimeType: 'image/svg+xml', data: Buffer.from(LOGO_SVG) },
  },
}
