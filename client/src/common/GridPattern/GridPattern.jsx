import { useEffect, useRef } from 'react'
import './GridPattern.css'

const CELL = 120
const OFFSET_X = -24
const OFFSET_Y = -45
const DOT = '#F28536'
const TRAIL_LIFE = 2.4
const DWELL_CHANCE = 0.18
const MAX_DT = 0.05
const MIN_SEP = 2.5 * CELL
const HOVER_RADIUS = 220

const VARIANTS = {
  dark: {
    bg: '#042503',
    line: '#556654',
    lineAlpha: 0.8,
    dotAlpha: 0.4,
    trail: '167, 181, 166',
    trailMax: 0.8,
    hoverMax: 0.9,
  },
  light: {
    bg: '#faf4f0',
    line: '#bfc9bf',
    lineAlpha: 0.7,
    dotAlpha: 0.55,
    trail: '85, 102, 84',
    trailMax: 0.4,
    hoverMax: 0.6,
  },
}

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

function createWalker(width, height, walkers) {
  const cols = Math.floor((width - OFFSET_X) / CELL)
  const rows = Math.floor((height - OFFSET_Y) / CELL)

  let best = null
  let bestDist = -1
  for (let attempt = 0; attempt < 40; attempt++) {
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

function pickDirection(walker, width, height, walkers) {
  const { dx, dy } = walker.dir
  const candidates = [
    { dx, dy, weight: 5 },
    { dx: -dy, dy: dx, weight: 3 },
    { dx: dy, dy: -dx, weight: 3 },
  ].filter(d => {
    const nx = walker.x + d.dx * CELL
    const ny = walker.y + d.dy * CELL
    return nx >= OFFSET_X && nx <= width + CELL && ny >= OFFSET_Y && ny <= height + CELL
  })

  if (candidates.length === 0) return { dx: -dx, dy: -dy }

  const separated = candidates.filter(
    d => distanceToNearestWalker(walker.x + d.dx * CELL, walker.y + d.dy * CELL, walkers, walker) >= MIN_SEP
  )
  const options = separated.length > 0 ? separated : [farthestOption(candidates, walker, walkers)]

  const total = options.reduce((sum, d) => sum + d.weight, 0)
  let roll = Math.random() * total
  for (const d of options) {
    roll -= d.weight
    if (roll <= 0) return d
  }
  return options[0]
}

function farthestOption(candidates, walker, walkers) {
  let best = candidates[0]
  let bestDist = -1
  for (const d of candidates) {
    const dist = distanceToNearestWalker(walker.x + d.dx * CELL, walker.y + d.dy * CELL, walkers, walker)
    if (dist > bestDist) {
      best = d
      bestDist = dist
    }
  }
  return best
}

function drawGrid(ctx, width, height, cfg) {
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

function drawGridHighlight(ctx, mouse, cfg) {
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

function drawWalker(ctx, walker, now, cfg) {
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  for (let i = 1; i < walker.trail.length; i++) {
    const a = walker.trail[i - 1]
    const b = walker.trail[i]
    const age = (now - b.t) / 1000
    const alpha = Math.max(0, 1 - age / TRAIL_LIFE) * cfg.trailMax
    if (alpha <= 0) continue
    ctx.strokeStyle = `rgba(${cfg.trail}, ${alpha})`
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
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

function updateWalker(walker, dt, now, width, height, walkers) {
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
    } else {
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
}

function nextGridStop(value, sign, offset) {
  const rel = (value - offset) / CELL
  const target = sign > 0 ? Math.floor(rel + 1e-6) + 1 : Math.ceil(rel - 1e-6) - 1
  return offset + target * CELL
}

export default function GridPattern({ variant = 'dark' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const cfg = VARIANTS[variant] ?? VARIANTS.dark
    let width = 0
    let height = 0
    let walkers = []
    let rafId = 0

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    function resize() {
      const dpr = window.devicePixelRatio || 1
      const nextWidth = canvas.clientWidth
      const nextHeight = canvas.clientHeight
      if (nextWidth === width && nextHeight === height && canvas.width === Math.round(nextWidth * dpr)) {
        return
      }
      width = nextWidth
      height = nextHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(8, Math.max(4, Math.round((width * height) / 220000)))
      while (walkers.length < count) walkers.push(createWalker(width, height, walkers))
      if (walkers.length > count) walkers.length = count
      if (reducedMotion) {
        drawGrid(ctx, width, height, cfg)
        walkers.forEach(w => drawWalker(ctx, w, performance.now(), cfg))
      }
    }

    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    window.addEventListener('resize', resize)

    if (reducedMotion) {
      return () => {
        resizeObserver.disconnect()
        window.removeEventListener('resize', resize)
      }
    }

    const mouse = { x: 0, y: 0, intensity: 0, target: 0 }
    function onMouseMove(e) {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
      mouse.target = mouse.x >= 0 && mouse.x <= width && mouse.y >= 0 && mouse.y <= height ? 1 : 0
    }
    function onMouseLeave() {
      mouse.target = 0
    }
    window.addEventListener('mousemove', onMouseMove)
    document.documentElement.addEventListener('mouseleave', onMouseLeave)

    let last = performance.now()
    function frame(now) {
      const dt = Math.min(MAX_DT, (now - last) / 1000)
      last = now
      drawGrid(ctx, width, height, cfg)
      mouse.intensity += (mouse.target - mouse.intensity) * Math.min(1, dt * 8)
      if (mouse.intensity > 0.01) {
        drawGridHighlight(ctx, mouse, cfg)
      }
      for (const walker of walkers) {
        updateWalker(walker, dt, now, width, height, walkers)
        drawWalker(ctx, walker, now, cfg)
      }
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      document.documentElement.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [variant])

  return <canvas ref={canvasRef} className="grid-pattern" aria-hidden="true" />
}
