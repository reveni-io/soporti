import { useEffect, useRef } from 'react'
import { createWalker, drawGrid, drawGridHighlight, drawWalker, updateWalker } from './grid-pattern-engine.js'
import './GridPattern.css'

const MAX_DT = 0.05
const MIN_WALKERS = 4
const MAX_WALKERS = 8
const AREA_PER_WALKER = 220000

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
      const count = Math.min(MAX_WALKERS, Math.max(MIN_WALKERS, Math.round((width * height) / AREA_PER_WALKER)))
      while (walkers.length < count) walkers.push(createWalker(width, height, walkers))
      if (walkers.length > count) walkers.length = count
      if (reducedMotion) {
        drawGrid(ctx, width, height, cfg)
        walkers.forEach(walker => drawWalker(ctx, walker, performance.now(), cfg))
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
    function onMouseMove(event) {
      const rect = canvas.getBoundingClientRect()
      mouse.x = event.clientX - rect.left
      mouse.y = event.clientY - rect.top
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
