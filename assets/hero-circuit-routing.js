const CELL_WIDTH = 800
const CELL_HEIGHT = 480
const LANE_COUNT = 16
const LANE_SPACING = 4
const CLEARANCE = ((LANE_COUNT - 1) * LANE_SPACING) / 2 + 5

const cross = (a, b) => a[0] * b[1] - a[1] * b[0]

function segmentsOf(points) {
  let length = 0
  const segments = points.slice(1).map(([x, y], index) => {
    const [fromX, fromY] = points[index]
    const distance = Math.hypot(x - fromX, y - fromY)
    const segment = { fromX, fromY, x, y, distance, start: length }
    length += distance
    return segment
  })
  return { segments, length }
}

// Offset the whole polyline, including its corners, so the lanes stay parallel.
function offsetPoints(points, offset) {
  const normals = points.slice(1).map(([x, y], index) => {
    const [fromX, fromY] = points[index]
    const length = Math.hypot(x - fromX, y - fromY)
    return [-(y - fromY) / length, (x - fromX) / length]
  })
  return points.map(([x, y], index) => {
    const before = normals[Math.max(0, index - 1)]
    const after = normals[Math.min(index, normals.length - 1)]
    const scale = offset / (1 + before[0] * after[0] + before[1] * after[1])
    return [
      x + (before[0] + after[0]) * scale,
      y + (before[1] + after[1]) * scale,
    ]
  })
}

function crossingWindows(route, buses) {
  const windows = []
  for (const other of buses) {
    if (other.id === route.bus.id) continue
    for (const a of route.segments) {
      for (const b of other.segments) {
        const r = [a.x - a.fromX, a.y - a.fromY]
        const s = [b.x - b.fromX, b.y - b.fromY]
        const denominator = cross(r, s)
        if (Math.abs(denominator) < 0.001) continue
        const delta = [b.fromX - a.fromX, b.fromY - a.fromY]
        const t = cross(delta, s) / denominator
        const u = cross(delta, r) / denominator
        if (t < 0 || t > 1 || u < 0 || u > 1) continue
        const position = a.start + t * a.distance
        // Cover the entire other bus, including shallow-angle crossings.
        const sine = Math.abs(denominator) / (a.distance * b.distance)
        const gap = CLEARANCE / sine
        windows.push({ start: position - gap, end: position + gap })
      }
    }
  }
  return windows
}

function terminateAtCrossing(route, buses) {
  const windows = crossingWindows(route, buses)
  const length = Math.max(
    0,
    Math.min(route.length, ...windows.map((window) => window.start)),
  )
  const segments = route.segments
    .filter((segment) => segment.start < length)
    .map((segment) => {
      const distance = Math.min(segment.distance, length - segment.start)
      const fraction = distance / segment.distance
      return {
        ...segment,
        x: segment.fromX + (segment.x - segment.fromX) * fraction,
        y: segment.fromY + (segment.y - segment.fromY) * fraction,
        distance,
      }
    })
  return { ...route, segments, length }
}

function random(seed) {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 16), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296
}

// A new emission starts at the route entrance, never on the far side of a crossing.
export function getSignalState(route, distanceTraveled, settings) {
  const burstLength = route.bus.maxLength * 1.75
  const cycle = burstLength / (settings.density / 100)
  if (!cycle) return null
  const time = distanceTraveled + route.bus.phase * cycle
  const emission = Math.floor(time / cycle)
  const seed = route.bus.seed + emission * 1013
  // Pick only 4–8 of the 16 lanes, spread across the bus, with a new selection each emission.
  const count = 4 + Math.floor(random(seed) * 5)
  const rotation = Math.floor(random(seed + 73) * LANE_COUNT)
  if ((route.lane * 5 + rotation) % LANE_COUNT >= count) return null
  const delay = random(seed + route.lane * 53 + 137) * route.bus.maxLength * 0.7
  const head = (time % cycle) - delay
  if (head <= 0 || head >= route.length) return null
  const fadeDistance = Math.min(48, route.length * 0.35)
  const opacity = Math.min(1, head / 20, (route.length - head) / fadeDistance)
  return { start: Math.max(0, head - settings.length), end: head, opacity }
}

export function createCircuitBuses(width, height) {
  const buses = []
  for (let row = 0; row < Math.ceil(height / CELL_HEIGHT); row++) {
    for (let column = 0; column < Math.ceil(width / CELL_WIDTH); column++) {
      const left = column * CELL_WIDTH
      const top = row * CELL_HEIGHT
      const layouts = [
        [
          [0, 100],
          [180, 100],
          [260, 180],
          [540, 180],
          [620, 100],
          [800, 100],
        ],
        [
          [0, 360],
          [180, 360],
          [260, 280],
          [540, 280],
          [620, 360],
          [800, 360],
        ],
        [
          [400, 0],
          [400, 72],
          [448, 120],
          [448, 360],
          [400, 408],
          [400, 480],
        ],
      ]
      for (const [index, layout] of layouts.entries()) {
        const points = layout.map(([x, y]) => [left + x, top + y])
        if (index % 2) points.reverse()
        const id = `${row}:${column}:${index}`
        const seed = row * 17 + column * 31 + index * 13 + 1
        buses.push({
          id,
          seed,
          points,
          phase: (seed * 0.61803398875) % 1,
          ...segmentsOf(points),
        })
      }
    }
  }
  const routes = buses.flatMap((bus) =>
    Array.from({ length: LANE_COUNT }, (_, lane) => ({
      bus,
      lane,
      ...segmentsOf(
        offsetPoints(bus.points, (lane - (LANE_COUNT - 1) / 2) * LANE_SPACING),
      ),
    })),
  )
  const terminated = routes.map((route) => terminateAtCrossing(route, buses))
  for (const bus of buses) {
    bus.maxLength = Math.max(
      0,
      ...terminated
        .filter((route) => route.bus === bus)
        .map((route) => route.length),
    )
  }
  return terminated.filter((route) => route.length > 0)
}
