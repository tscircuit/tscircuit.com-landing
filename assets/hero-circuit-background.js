import { createCircuitBuses, getSignalStates } from "./hero-circuit-routing.js"

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
    // Crossing routes remain intact; signals exit by moving beyond their endpoints.
    routes = createCircuitBuses(
      width,
      height,
      settings.turns,
      settings.busCount,
      settings.tracesPerBus,
    )
    draw()
  }

  const draw = () => {
    context.clearRect(0, 0, width, height)
    if (reducedMotion.matches) return
    context.lineWidth = settings.strokeWidth
    for (const route of routes) {
      for (const signal of getSignalStates(route, distanceTraveled, settings)) {
        drawCircuitSignal(context, route, signal, settings)
      }
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
      const geometryChanged =
        nextSettings.turns !== settings.turns ||
        nextSettings.busCount !== settings.busCount ||
        nextSettings.tracesPerBus !== settings.tracesPerBus
      settings = { ...nextSettings }
      if (geometryChanged)
        routes = createCircuitBuses(
          width,
          height,
          settings.turns,
          settings.busCount,
          settings.tracesPerBus,
        )
      draw()
    },
  }
}

// Follow distance along the route, so fading stays continuous around bends.
export function drawCircuitSignal(context, route, signal, settings) {
  const fadeLength = settings.length * ((settings.tailFade || 0) / 100)
  context.globalAlpha = 0.3
  context.strokeStyle = "#929292"
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
    const fromX = segment.fromX + dx * a
    const fromY = segment.fromY + dy * a
    const toX = segment.fromX + dx * b
    const toY = segment.fromY + dy * b
    if (fadeLength > 0) {
      const alphaAt = (position) =>
        Math.min(1, Math.max(0, (position - signal.tail) / fadeLength))
      const gradient = context.createLinearGradient(fromX, fromY, toX, toY)
      gradient.addColorStop(0, `rgba(146, 146, 146, ${alphaAt(from)})`)
      const fadeEnd = signal.tail + fadeLength
      if (fadeEnd > from && fadeEnd < to) {
        gradient.addColorStop((fadeEnd - from) / (to - from), "#929292")
      }
      gradient.addColorStop(1, `rgba(146, 146, 146, ${alphaAt(to)})`)
      context.strokeStyle = gradient
      context.beginPath()
      context.moveTo(fromX, fromY)
      context.lineTo(toX, toY)
      context.stroke()
    } else {
      if (!started) {
        context.moveTo(fromX, fromY)
        started = true
      }
      context.lineTo(toX, toY)
    }
  }
  if (!fadeLength) context.stroke()
}
