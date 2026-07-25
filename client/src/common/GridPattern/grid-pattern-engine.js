const CELL = 120
const OFFSET_X = -24
const OFFSET_Y = -45
const DOT = '#F28536'
const TRAIL_LIFE = 2.4
const DWELL_CHANCE = 0.18
const MIN_SEP = 2.5 * CELL
const HOVER_RADIUS = 220
const PLACEMENT_ATTEMPTS = 40

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function distanceToNearestWalker(x, y, walkers, self) {
  let nearest = Infinity
  for (const other of walkers) {
    if (other === self) continue
    nearest = Math.min(nearest, Math.hypot(other.x - x, other.y - y))
  }
  return nearest
}

export function createWalker(width, height, walkers) {
  const cols = Math.floor((width - OFFSET_X) / CELL)
  const rows = Math.floor((height - OFFSET_Y) / CELL)

  let best = null
  let bestDist = -1
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const x = OFFSET_X + (1 + Math.floor(Math.random() * (cols - 1))) * CELL
    const y = OFFSET_Y + (1 + Math.floor(Math.random() * (rows - 1))) * CELL
    const dist = distanceToNearestWalker(x, y, walkers, null)
    if (dist > bestDist) {
      best = { x, y }
      bestDist = dist
    }
    if (dist >= MIN_SEP * 1.5) break
  }

  return {
    x: best.x,
    y: best.y,
    dir: randomItem([
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ]),
    speed: 90 + Math.random() * 60,
    trail: [],
    dwellUntil: 0,
    dwellStart: 0,
  }
}

function farthestOption(candidates, walker, walkers) {
  let best = candidates[0]
  let bestDist = -1
  for (const candidate of candidates) {
    const dist = distanceToNearestWalker(
      walker.x + candidate.dx * CELL,
      walker.y + candidate.dy * CELL,
      walkers,
      walker
    )
    if (dist > bestDist) {
      best = candidate
      bestDist = dist
    }
  }
  return best
}

function pickDirection(walker, width, height, walkers) {
  const { dx, dy } = walker.dir
  const candidates = [
    { dx, dy, weight: 5 },
    { dx: -dy, dy: dx, weight: 3 },
    { dx: dy, dy: -dx, weight: 3 },
  ].filter(candidate => {
    const nx = walker.x + candidate.dx * CELL
    const ny = walker.y + candidate.dy * CELL
    return nx >= OFFSET_X && nx <= width + CELL && ny >= OFFSET_Y && ny <= height + CELL
  })

  if (candidates.length === 0) return { dx: -dx, dy: -dy }

  const separated = candidates.filter(
    candidate =>
      distanceToNearestWalker(walker.x + candidate.dx * CELL, walker.y + candidate.dy * CELL, walkers, walker) >=
      MIN_SEP
  )
  const options = separated.length > 0 ? separated : [farthestOption(candidates, walker, walkers)]

  const total = options.reduce((sum, option) => sum + option.weight, 0)
  let roll = Math.random() * total
  for (const option of options) {
    roll -= option.weight
    if (roll <= 0) return option
  }
  return options[0]
}

export function drawGrid(ctx, width, height, cfg) {
  ctx.fillStyle = cfg.bg
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = cfg.line
  ctx.lineWidth = 0.5
  ctx.globalAlpha = cfg.lineAlpha
  ctx.beginPath()
  for (let x = OFFSET_X; x <= width; x += CELL) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
  }
  for (let y = OFFSET_Y; y <= height; y += CELL) {
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
  }
  ctx.stroke()

  ctx.globalAlpha = cfg.dotAlpha
  ctx.fillStyle = cfg.line
  for (let x = OFFSET_X; x <= width; x += CELL) {
    for (let y = OFFSET_Y; y <= height; y += CELL) {
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

export function drawGridHighlight(ctx, mouse, cfg) {
  const gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, HOVER_RADIUS)
  gradient.addColorStop(0, `rgba(${cfg.trail}, ${cfg.hoverMax * mouse.intensity})`)
  gradient.addColorStop(0.5, `rgba(${cfg.trail}, ${cfg.hoverMax * 0.45 * mouse.intensity})`)
  gradient.addColorStop(1, `rgba(${cfg.trail}, 0)`)

  const firstX = OFFSET_X + Math.ceil((mouse.x - HOVER_RADIUS - OFFSET_X) / CELL) * CELL
  const firstY = OFFSET_Y + Math.ceil((mouse.y - HOVER_RADIUS - OFFSET_Y) / CELL) * CELL

  ctx.strokeStyle = gradient
  ctx.lineWidth = 1.25
  ctx.beginPath()
  for (let x = firstX; x <= mouse.x + HOVER_RADIUS; x += CELL) {
    ctx.moveTo(x, mouse.y - HOVER_RADIUS)
    ctx.lineTo(x, mouse.y + HOVER_RADIUS)
  }
  for (let y = firstY; y <= mouse.y + HOVER_RADIUS; y += CELL) {
    ctx.moveTo(mouse.x - HOVER_RADIUS, y)
    ctx.lineTo(mouse.x + HOVER_RADIUS, y)
  }
  ctx.stroke()

  ctx.fillStyle = gradient
  for (let x = firstX; x <= mouse.x + HOVER_RADIUS; x += CELL) {
    for (let y = firstY; y <= mouse.y + HOVER_RADIUS; y += CELL) {
      ctx.beginPath()
      ctx.arc(x, y, 4.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function drawWalker(ctx, walker, now, cfg) {
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  for (let i = 1; i < walker.trail.length; i++) {
    const from = walker.trail[i - 1]
    const to = walker.trail[i]
    const age = (now - to.t) / 1000
    const alpha = Math.max(0, 1 - age / TRAIL_LIFE) * cfg.trailMax
    if (alpha <= 0) continue

    ctx.strokeStyle = `rgba(${cfg.trail}, ${alpha})`
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  if (walker.dwellUntil > now) {
    const progress = Math.min(1, (now - walker.dwellStart) / 900)
    ctx.strokeStyle = `rgba(242, 133, 54, ${0.7 * (1 - progress)})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(walker.x, walker.y, 7 + progress * 16, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(242, 133, 54, 0.2)'
  ctx.beginPath()
  ctx.arc(walker.x, walker.y, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = DOT
  ctx.beginPath()
  ctx.arc(walker.x, walker.y, 5, 0, Math.PI * 2)
  ctx.fill()
}

function nextGridStop(value, sign, offset) {
  const rel = (value - offset) / CELL
  const target = sign > 0 ? Math.floor(rel + 1e-6) + 1 : Math.ceil(rel - 1e-6) - 1
  return offset + target * CELL
}

export function updateWalker(walker, dt, now, width, height, walkers) {
  walker.trail.push({ x: walker.x, y: walker.y, t: now })
  while (walker.trail.length && now - walker.trail[0].t > TRAIL_LIFE * 1000) {
    walker.trail.shift()
  }

  if (walker.dwellUntil > now) return

  let step = walker.speed * dt
  while (step > 0) {
    const { dx, dy } = walker.dir
    const dist =
      dx !== 0
        ? Math.abs(nextGridStop(walker.x, dx, OFFSET_X) - walker.x)
        : Math.abs(nextGridStop(walker.y, dy, OFFSET_Y) - walker.y)

    if (step < dist) {
      walker.x += dx * step
      walker.y += dy * step
      step = 0
      continue
    }

    walker.x = dx !== 0 ? nextGridStop(walker.x, dx, OFFSET_X) : walker.x
    walker.y = dy !== 0 ? nextGridStop(walker.y, dy, OFFSET_Y) : walker.y
    step -= dist
    if (Math.random() < DWELL_CHANCE) {
      walker.dwellStart = now
      walker.dwellUntil = now + 700 + Math.random() * 900
      return
    }
    walker.dir = pickDirection(walker, width, height, walkers)
  }
}
