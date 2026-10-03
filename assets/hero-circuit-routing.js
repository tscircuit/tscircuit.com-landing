const CELL_WIDTH = 520
const BUS_ROW_SPACING = 112
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
  const rows = Math.max(2, Math.ceil((height - 152) / BUS_ROW_SPACING) + 1)
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
  // Distribute full-width buses over the complete section, including its last row.
  // Stagger bends independently so neighboring buses do not leave repeating gaps.
  for (let row = 0; row < rows; row++) {
    const y = 76 + ((height - 152) * row) / (rows - 1)
    const direction = row === rows - 1 ? -1 : row % 2 === 0 ? 1 : -1
    const middle = y + direction * 28
    const points = [[-64, y]]
    for (let column = 0; column < columns; column++) {
      const left = column * CELL_WIDTH
      const turn = left + 48 + random(row * 97 + column * 31) * 120
      points.push(
        [turn, y],
        [turn + 28, middle],
        [turn + 228, middle],
        [turn + 256, y],
      )
    }
    points.push([columns * CELL_WIDTH + 64, y])
    addBus(points, row * 17 + 1, `horizontal:${row}`, row % 2 === 1)
  }
  // Spread top entries across the viewport and send them toward alternating sides.
  // Varied exit depths avoid collecting all of the vertical buses at the bottom.
  const topEntries = Math.max(1, Math.ceil(width / 320))
  for (let index = 0; index < topEntries; index++) {
    const entryX = ((index + 0.5) * width) / topEntries
    const direction = index % 2 === 0 ? 1 : -1
    const exitY = height * (0.5 + random(index * 31 + 9) * 0.4)
    const diagonal = Math.min(96, width * 0.15)
    const firstTurnY = 72 + random(index * 17 + 3) * 64
    const points = [
      [entryX, -64],
      [entryX, firstTurnY],
      [entryX + direction * 48, firstTurnY + 48],
      [entryX + direction * 48, exitY - diagonal],
      [entryX + direction * (48 + diagonal), exitY],
      [direction === 1 ? width + 64 : -64, exitY],
    ]
    addBus(points, index * 31 + 27, `top-to-side:${index}`, false)
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
