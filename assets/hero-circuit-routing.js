const CELL_WIDTH = 480
const CELL_HEIGHT = 320
const LANE_COUNT = 8
const LANE_SPACING = 4
const CLEARANCE = ((LANE_COUNT - 1) * LANE_SPACING) / 2 + 5
const FADE_DISTANCE = 24

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

function fadedPieces(route, windows) {
  const opacityAt = (position) => {
    let opacity = 1
    for (const window of windows) {
      const distance = Math.max(
        window.start - position,
        position - window.end,
        0,
      )
      opacity = Math.min(opacity, distance / FADE_DISTANCE)
    }
    return Math.min(1, opacity)
  }
  const pieces = []
  for (const segment of route.segments) {
    const start = segment.start
    const end = start + segment.distance
    const boundaries = [start, end]
    for (const window of windows) {
      for (const point of [
        window.start - FADE_DISTANCE,
        window.start,
        window.end,
        window.end + FADE_DISTANCE,
      ]) {
        if (point > start && point < end) boundaries.push(point)
      }
    }
    boundaries.sort((a, b) => a - b)
    for (let i = 1; i < boundaries.length; i++) {
      const from = boundaries[i - 1]
      const to = boundaries[i]
      if (to - from < 0.001) continue
      const fromOpacity = opacityAt(from)
      const toOpacity = opacityAt(to)
      if (fromOpacity === 0 && toOpacity === 0) continue
      const a = (from - start) / segment.distance
      const b = (to - start) / segment.distance
      const dx = segment.x - segment.fromX
      const dy = segment.y - segment.fromY
      pieces.push({
        fromX: segment.fromX + dx * a,
        fromY: segment.fromY + dy * a,
        x: segment.fromX + dx * b,
        y: segment.fromY + dy * b,
        start: from,
        distance: to - from,
        fromOpacity,
        toOpacity,
      })
    }
  }
  return pieces
}

export function createCircuitBuses(width, height) {
  const buses = []
  for (let row = 0; row < Math.ceil(height / CELL_HEIGHT); row++) {
    for (let column = 0; column < Math.ceil(width / CELL_WIDTH); column++) {
      const left = column * CELL_WIDTH
      const top = row * CELL_HEIGHT
      const layouts = [
        [
          [0, 64],
          [88, 64],
          [136, 112],
          [296, 112],
          [344, 64],
          [480, 64],
        ],
        [
          [0, 236],
          [88, 236],
          [136, 188],
          [296, 188],
          [344, 236],
          [480, 236],
        ],
        [
          [192, 0],
          [192, 40],
          [224, 72],
          [224, 248],
          [192, 280],
          [192, 320],
        ],
        [
          [392, 0],
          [392, 72],
          [360, 104],
          [360, 216],
          [392, 248],
          [392, 320],
        ],
      ]
      for (const [index, layout] of layouts.entries()) {
        const points = layout.map(([x, y]) => [left + x, top + y])
        if (index % 2) points.reverse()
        const id = `${row}:${column}:${index}`
        const seed = row * 17 + column * 31 + index * 13 + 1
        buses.push({
          id,
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
  return routes.map((route) => ({
    ...route,
    pieces: fadedPieces(route, crossingWindows(route, buses)),
  }))
}
