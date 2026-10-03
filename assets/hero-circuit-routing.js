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
  const routes = []
  const rows = Math.max(2, Math.ceil((height - 152) / BUS_ROW_SPACING) + 1)
  const addBus = (lanePaths, seed, id, mirror = false) => {
    const bus = { id, seed, phase: (seed * 0.61803398875) % 1 }
    const lanes = lanePaths.map((points, lane) => {
      let offset = offsetPoints(
        points,
        (lane - (LANE_COUNT - 1) / 2) * LANE_SPACING,
      )
      if (mirror) offset = offset.map(([x, y]) => [width - x, y])
      return { bus, lane, ...segmentsOf(offset) }
    })
    bus.maxLength = Math.max(...lanes.map((route) => route.length))
    routes.push(...lanes)
  }
  // Each 16-wire trunk sheds its outer four wires on either side. The middle
  // eight continue onward: these are continuous wires, not duplicated branches.
  for (let row = 0; row < rows; row++) {
    const y = 76 + ((height - 152) * row) / (rows - 1)
    const upperY = Math.max(44, y - 64 - random(row * 13 + 5) * 56)
    const lowerY = Math.min(height - 44, y + 64 + random(row * 23 + 7) * 56)
    const trunkY = y + (row % 2 === 0 ? 1 : -1) * 24
    const fork = (targetY, splitX) => {
      const diagonal = Math.abs(targetY - y)
      return [
        [-64, y],
        [splitX, y],
        [splitX + diagonal, targetY],
        [width + 64, targetY],
      ]
    }
    const upperSplit = width * (0.18 + random(row * 31 + 2) * 0.3)
    const lowerSplit = width * (0.42 + random(row * 19 + 4) * 0.24)
    const upper = fork(upperY, upperSplit)
    const lower = fork(lowerY, lowerSplit)
    // Let both outer groups depart before bending the remaining inner wires.
    const trunk = fork(trunkY, Math.max(width * 0.75, lowerSplit + 32))
    addBus(
      Array.from({ length: LANE_COUNT }, (_, lane) =>
        lane < 4 ? upper : lane >= 12 ? lower : trunk,
      ),
      row * 17 + 1,
      `horizontal:${row}`,
      row % 2 === 1,
    )
  }
  // Vertical trunks fan out in four-wire groups at separate depths. Outer
  // groups peel away first, leaving the inner wires to continue down the trunk.
  const topEntries = Math.max(1, Math.ceil(width / 400))
  for (let index = 0; index < topEntries; index++) {
    const entryX = ((index + 0.5) * width) / topEntries
    const branches = Array.from({ length: 4 }, (_, group) => {
      const direction = group < 2 ? 1 : -1
      const inner = group === 1 || group === 2
      const exitY =
        height *
        ((inner ? 0.52 : 0.24) + random(index * 37 + group * 11) * 0.16)
      const diagonal = Math.min(72, width * 0.15)
      return [
        [entryX, -64],
        [entryX, exitY - diagonal],
        [entryX + direction * diagonal, exitY],
        [direction === 1 ? width + 64 : -64, exitY],
      ]
    })
    addBus(
      Array.from(
        { length: LANE_COUNT },
        (_, lane) => branches[Math.floor(lane / 4)],
      ),
      index * 31 + 27,
      `top-to-side:${index}`,
    )
  }
  return routes
}
