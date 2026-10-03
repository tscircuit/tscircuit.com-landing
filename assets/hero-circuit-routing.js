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

// Add doglegs to a straight run without changing its endpoints.
// Each dogleg has four 45-degree turns. Leave room for the full lane bundle's
// mitered corners; narrow viewports naturally fit fewer turns.
function addRunTurns(points, width, height, turns, seed, bounds) {
  const [fromX, y] = points.at(-2)
  const [toX] = points.at(-1)
  const direction = Math.sign(toX - fromX)
  const startX =
    direction > 0
      ? Math.max(0, bounds.startX) + 24
      : Math.min(width, bounds.startX) - 24
  const endX = direction > 0 ? width - 24 : 24
  const available = (endX - startX) * direction
  const count = Math.min(turns / 4, Math.max(0, Math.floor(available / 96)))
  if (!count) return points
  const result = points.slice(0, -1)
  const spacing = available / count
  for (let index = 0; index < count; index++) {
    const lead = (spacing - 64) * (0.2 + random(seed + index * 17) * 0.6)
    const x = startX + direction * (index * spacing + lead)
    let bend = random(seed + index * 29 + 3) < 0.5 ? -16 : 16
    if (bounds.minY + bend < 44 || bounds.maxY + bend > height - 44)
      bend = -bend
    result.push(
      [x, y],
      [x + direction * 16, y + bend],
      [x + direction * 48, y + bend],
      [x + direction * 64, y],
    )
  }
  result.push(points.at(-1))
  return result
}

export function createCircuitBuses(width, height, extraTurns = 8) {
  const turns = Number.isFinite(extraTurns)
    ? Math.max(0, Math.min(24, Math.round(extraTurns / 4) * 4))
    : 8
  const routes = []
  const rows = Math.max(2, Math.ceil((height - 152) / BUS_ROW_SPACING) + 1)
  const addBus = (lanePaths, seed, id, mirror = false) => {
    const bus = { id, seed, phase: (seed * 0.61803398875) % 1 }
    // Bends start after the last fork and move sibling branches together. This
    // keeps the outgoing bundles from weaving through each other near an edge.
    const bounds = new Map()
    for (const points of lanePaths) {
      const [x, y] = points.at(-2)
      const direction = Math.sign(points.at(-1)[0] - x)
      const group = bounds.get(direction) || { startX: x, minY: y, maxY: y }
      group.startX =
        direction > 0 ? Math.max(group.startX, x) : Math.min(group.startX, x)
      group.minY = Math.min(group.minY, y)
      group.maxY = Math.max(group.maxY, y)
      bounds.set(direction, group)
    }
    // Put turns into the shared incoming trunk as well as the outgoing branches.
    // Transposing vertical trunks lets the same spacing rules cover both axes.
    const vertical = lanePaths[0][0][0] === lanePaths[0][1][0]
    const incoming = lanePaths.map((points) =>
      [...points].reverse().map(([x, y]) => (vertical ? [y, x] : [x, y])),
    )
    const firstFork = Math.min(...incoming.map((points) => points.at(-2)[0]))
    const trunkPosition = incoming[0].at(-1)[1]
    const incomingBounds = {
      startX: firstFork,
      minY: trunkPosition,
      maxY: trunkPosition,
    }
    const lanes = lanePaths.map((points, lane) => {
      const trunk = addRunTurns(
        incoming[lane],
        vertical ? height : width,
        vertical ? width : height,
        turns,
        seed + 241,
        incomingBounds,
      )
        .reverse()
        .map(([x, y]) => (vertical ? [y, x] : [x, y]))
      const remaining = turns - (trunk.length - points.length)
      const direction = Math.sign(points.at(-1)[0] - points.at(-2)[0])
      let offset = offsetPoints(
        addRunTurns(
          trunk,
          width,
          height,
          remaining,
          seed,
          bounds.get(direction),
        ),
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
