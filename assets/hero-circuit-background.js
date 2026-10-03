import { createCircuitBuses } from "./hero-circuit-routing.js"

const FRAME_INTERVAL = 1000 / 30

export function initHeroCircuitBackground(container, initialSettings) {
  let settings = { ...initialSettings }
  const canvas = container.querySelector("canvas")
  const context = canvas.getContext("2d")
  if (!context) return

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  let routes = []
  let width = 0
  let height = 0
  let visible = false
  let frame = 0
  let lastTime = 0
  let distanceTraveled = 0

  const resize = () => {
    const bounds = container.getBoundingClientRect()
    width = bounds.width
    height = bounds.height
    // Bound backing-store cost on high-density displays; routing uses CSS pixels.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.lineCap = "round"
    context.lineJoin = "round"
    context.strokeStyle = "#929292"
    // Geometry, crossing gaps, and fade gradients are computed only on resize.
    routes = createCircuitBuses(width, height).map((route) => ({
      ...route,
      pieces: route.pieces.map((piece) => {
        const gradient = context.createLinearGradient(
          piece.fromX,
          piece.fromY,
          piece.x,
          piece.y,
        )
        gradient.addColorStop(0, `rgba(146, 146, 146, ${piece.fromOpacity})`)
        gradient.addColorStop(1, `rgba(146, 146, 146, ${piece.toOpacity})`)
        return { ...piece, gradient }
      }),
    }))
    draw()
  }

  const draw = () => {
    context.clearRect(0, 0, width, height)
    if (reducedMotion.matches) return
    context.lineWidth = settings.strokeWidth
    for (const route of routes) {
      // Shared timing makes the eight lanes read as a traveling bus.
      const cycle =
        (route.bus.length + settings.length) / (settings.density / 100)
      const head =
        (distanceTraveled + route.bus.phase * cycle + route.lane * 2) % cycle
      if (head >= route.length + settings.length) continue
      const start = Math.max(0, head - settings.length)
      const end = Math.min(route.length, head)
      context.globalAlpha = 0.3
      for (const segment of route.pieces) {
        const from = Math.max(start, segment.start)
        const to = Math.min(end, segment.start + segment.distance)
        if (from >= to) continue
        const a = (from - segment.start) / segment.distance
        const b = (to - segment.start) / segment.distance
        const dx = segment.x - segment.fromX
        const dy = segment.y - segment.fromY
        context.beginPath()
        context.strokeStyle = segment.gradient
        context.moveTo(segment.fromX + dx * a, segment.fromY + dy * a)
        context.lineTo(segment.fromX + dx * b, segment.fromY + dy * b)
        context.stroke()
      }
    }
    context.globalAlpha = 1
  }

  const tick = (time) => {
    if (!lastTime) lastTime = time
    if (time - lastTime >= FRAME_INTERVAL) {
      distanceTraveled += ((time - lastTime) / 1000) * settings.speed
      lastTime = time
      draw()
    }
    frame = requestAnimationFrame(tick)
  }

  const updateActivity = () => {
    cancelAnimationFrame(frame)
    lastTime = 0
    const active = visible && !document.hidden && !reducedMotion.matches
    if (active) frame = requestAnimationFrame(tick)
    if (reducedMotion.matches) context.clearRect(0, 0, width, height)
  }

  new ResizeObserver(resize).observe(container)
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    updateActivity()
  }).observe(container)
  document.addEventListener("visibilitychange", updateActivity)
  reducedMotion.addEventListener("change", updateActivity)

  return {
    setSettings(nextSettings) {
      settings = { ...nextSettings }
      draw()
    },
  }
}
