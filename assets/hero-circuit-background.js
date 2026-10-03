// Fixed-size routing cells preserve 45-degree bends and dense spacing on every screen.
const CELL_WIDTH = 480
const CELL_HEIGHT = 320
const FRAME_INTERVAL = 1000 / 30

export function initHeroCircuitBackground(container) {
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
  let elapsed = 0

  const makeRoute = (points, seed) => {
    let length = 0
    const segments = points.slice(1).map(([x, y], index) => {
      const [fromX, fromY] = points[index]
      const distance = Math.hypot(x - fromX, y - fromY)
      const segment = { fromX, fromY, x, y, distance, start: length }
      length += distance
      return segment
    })
    return {
      segments,
      length,
      tail: 38 + (seed % 47),
      speed: 18 + (seed % 17),
      phase: ((seed * 0.61803398875) % 1) * length,
      opacity: 0.22 + (seed % 5) * 0.035,
    }
  }

  const resize = () => {
    const bounds = container.getBoundingClientRect()
    width = bounds.width
    height = bounds.height
    // Bound backing-store cost on high-density displays; routing uses CSS pixels.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.lineWidth = 0.7
    context.lineCap = "round"
    context.lineJoin = "round"
    context.strokeStyle = "#929292"
    routes = []
    for (let row = 0; row < Math.ceil(height / CELL_HEIGHT); row++) {
      for (let column = 0; column < Math.ceil(width / CELL_WIDTH); column++) {
        const left = column * CELL_WIDTH
        const top = row * CELL_HEIGHT
        const cell = row * 17 + column * 31
        for (let lane = 0; lane < 28; lane++) {
          const y = top + 12 + lane * 10
          const bend = 24 + ((lane + cell) % 4) * 8
          const turn = left + 92 + ((lane + cell) % 3) * 28
          const direction = lane % 2 ? 1 : -1
          const points = [
            [left - 24, y],
            [turn, y],
            [turn + bend, y + direction * bend],
            [turn + 172, y + direction * bend],
            [turn + 172 + bend, y],
            [left + CELL_WIDTH + 24, y],
          ]
          if (lane % 3 === 0) points.reverse()
          routes.push(makeRoute(points, cell * 37 + lane * 13 + 1))
        }
        for (let lane = 0; lane < 12; lane++) {
          const x = left + 24 + lane * 38
          const y = top + 76 + (lane % 3) * 16
          const bend = lane % 2 ? 32 : -32
          const points = [
            [x, top - 16],
            [x, y],
            [x + bend, y + 32],
            [x + bend, top + CELL_HEIGHT + 16],
          ]
          if (lane % 2) points.reverse()
          routes.push(makeRoute(points, cell * 43 + lane * 19 + 509))
        }
      }
    }
    draw()
  }

  const draw = () => {
    context.clearRect(0, 0, width, height)
    if (reducedMotion.matches) return
    for (const route of routes) {
      const head =
        (elapsed * route.speed + route.phase) % (route.length + route.tail)
      const start = Math.max(0, head - route.tail)
      const end = Math.min(route.length, head)
      context.beginPath()
      for (const segment of route.segments) {
        const from = Math.max(start, segment.start)
        const to = Math.min(end, segment.start + segment.distance)
        if (from >= to) continue
        const a = (from - segment.start) / segment.distance
        const b = (to - segment.start) / segment.distance
        const dx = segment.x - segment.fromX
        const dy = segment.y - segment.fromY
        context.moveTo(segment.fromX + dx * a, segment.fromY + dy * a)
        context.lineTo(segment.fromX + dx * b, segment.fromY + dy * b)
      }
      context.globalAlpha = route.opacity
      context.stroke()
    }
    context.globalAlpha = 1
  }

  const tick = (time) => {
    if (!lastTime) lastTime = time
    if (time - lastTime >= FRAME_INTERVAL) {
      elapsed += (time - lastTime) / 1000
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
}
