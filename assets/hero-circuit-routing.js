const CELL_WIDTH = 800
const CELL_HEIGHT = 480
const LANE_COUNT = 16
const LANE_SPACING = 4

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

function random(seed) {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 16), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296
}

// Higher densities overlap emissions; retain each one until its tail exits.
export function getSignalStates(route, distanceTraveled, settings) {
  const signals = []
  const burstLength = route.bus.maxLength * 1.75 + settings.length
  const cycle = burstLength / (settings.density / 100)
  if (!Number.isFinite(cycle) || cycle <= 0) return signals
  // Start with an empty canvas; initial emissions also enter from an edge.
  const time = distanceTraveled - route.bus.phase * 80
  if (time < 0) return signals
  // Only examine emissions whose tails could still be on the route. This bounds
  // work by density rather than by how long the page has been open.
  const firstEmission = Math.max(
    0,
    Math.floor((time - burstLength) / cycle) + 1,
  )
  const lastEmission = Math.floor(time / cycle)
  for (let emission = firstEmission; emission <= lastEmission; emission++) {
    const seed = route.bus.seed + emission * 1013
    // Pick 4–8 lanes per emission, with independent delays and changing selections.
    const count = 4 + Math.floor(random(seed) * 5)
    const rotation = Math.floor(random(seed + 73) * LANE_COUNT)
    if ((route.lane * 5 + rotation) % LANE_COUNT >= count) continue
    const delay =
      random(seed + route.lane * 53 + 137) * route.bus.maxLength * 0.7
    const head = time - emission * cycle - delay
    if (head <= 0 || head >= route.length + settings.length) continue
    signals.push({
      // Keep the unclipped tail so the fade moves naturally through entry/exit edges.
      tail: head - settings.length,
      start: Math.max(0, head - settings.length),
      end: Math.min(route.length, head),
    })
  }
  return signals
}

export function createCircuitBuses(width, height) {
  const buses = []
  const columns = Math.ceil(width / CELL_WIDTH)
  const rows = Math.ceil(height / CELL_HEIGHT)
  const addBus = (points, seed, id, reverse) => {
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    if (
      Math.min(...xs) > width + 32 ||
      Math.max(...xs) < -32 ||
      Math.min(...ys) > height + 32 ||
      Math.max(...ys) < -32
    )
      return
    if (reverse) points.reverse()
    buses.push({
      id,
      seed,
      points,
      phase: (seed * 0.61803398875) % 1,
      ...segmentsOf(points),
    })
  }
  // Join routing cells into full-width buses; internal cell boundaries are not emitters.
  for (let row = 0; row < rows; row++) {
    for (let index = 0; index < 2; index++) {
      const top = row * CELL_HEIGHT
      const y = index === 0 ? 100 : 360
      const middle = index === 0 ? 180 : 280
      // Keep the complete bus above the bottom edge, including outer lanes.
      if (top + Math.max(y, middle) + 42 >= height) continue
      const points = [[-32, top + y]]
      for (let column = 0; column < columns; column++) {
        const left = column * CELL_WIDTH
        if (column === 0) points.push([left, top + y])
        points.push(
          [left + 180, top + y],
          [left + 260, top + middle],
          [left + 540, top + middle],
          [left + 620, top + y],
          [left + 800, top + y],
        )
      }
      points.push([columns * CELL_WIDTH + 32, top + y])
      addBus(
        points,
        row * 17 + index * 13 + 1,
        `horizontal:${row}:${index}`,
        index === 1,
      )
    }
  }
  // Enter above the header near the left-middle, then turn out through the right edge.
  const topEntries = width < 640 ? 1 : 2
  for (let index = 0; index < topEntries; index++) {
    const entryX = width * (topEntries === 1 ? 0.34 : 0.28 + index * 0.15)
    const exitY = height - 80 - index * 80
    const diagonal = Math.min(120, width * 0.18)
    const firstTurnY = 96 + index * 64
    const points = [
      [entryX, -32],
      [entryX, firstTurnY],
      [entryX + 48, firstTurnY + 48],
      [entryX + 48, exitY - diagonal],
      [entryX + 48 + diagonal, exitY],
      [width + 32, exitY],
    ]
    addBus(points, index * 31 + 27, `top-to-right:${index}`, false)
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
  for (const bus of buses) {
    bus.maxLength = Math.max(
      0,
      ...routes
        .filter((route) => route.bus === bus)
        .map((route) => route.length),
    )
  }
  return routes
}
