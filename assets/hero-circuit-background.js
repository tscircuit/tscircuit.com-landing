import { createCircuitBuses, getSignalState } from "./hero-circuit-routing.js"

export function initHeroCircuitBackground(container, initialSettings) {
  let settings = { ...initialSettings }
  const canvas = container.querySelector("canvas")
  const context = canvas.getContext("2d")
  if (!context) return

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  let routes = []
  let allRoutes = new Path2D()
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
    // Crossing routes remain intact; signals exit by moving beyond their endpoints.
    allRoutes = new Path2D()
    routes = createCircuitBuses(width, height).map((route) => {
      const path = new Path2D()
      path.moveTo(route.segments[0].fromX, route.segments[0].fromY)
      for (const segment of route.segments) path.lineTo(segment.x, segment.y)
      allRoutes.addPath(path)
      return route
    })
    draw()
  }

  const draw = () => {
    context.clearRect(0, 0, width, height)
    if (reducedMotion.matches && !settings.showAll) return
    context.lineWidth = settings.strokeWidth
    context.globalAlpha = 0.3
    if (settings.showAll) {
      // One stroke also keeps overlapping extensions at the same subtle opacity.
      context.stroke(allRoutes)
      context.globalAlpha = 1
      return
    }
    for (const route of routes) {
      const signal = getSignalState(route, distanceTraveled, settings)
      if (!signal) continue
      context.beginPath()
      let started = false
      for (const segment of route.segments) {
        const from = Math.max(signal.start, segment.start)
        const to = Math.min(signal.end, segment.start + segment.distance)
        if (from >= to) continue
        const a = (from - segment.start) / segment.distance
        const b = (to - segment.start) / segment.distance
        const dx = segment.x - segment.fromX
        const dy = segment.y - segment.fromY
        if (!started) {
          context.moveTo(segment.fromX + dx * a, segment.fromY + dy * a)
          started = true
        }
        context.lineTo(segment.fromX + dx * b, segment.fromY + dy * b)
      }
      context.stroke()
    }
    context.globalAlpha = 1
  }

  const tick = (time) => {
    if (lastTime) {
      distanceTraveled += ((time - lastTime) / 1000) * settings.speed
    }
    lastTime = time
    draw()
    frame = requestAnimationFrame(tick)
  }

  const updateActivity = () => {
    cancelAnimationFrame(frame)
    lastTime = 0
    const active =
      visible && !document.hidden && !reducedMotion.matches && !settings.showAll
    if (active) frame = requestAnimationFrame(tick)
    if (reducedMotion.matches || settings.showAll) draw()
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
      updateActivity()
      if (!reducedMotion.matches && !settings.showAll) draw()
    },
  }
}
