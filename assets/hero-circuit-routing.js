const BUS_ROW_SPACING = 112
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
    // Select a quarter to half the traces, with at least one for small buses.
    const laneCount = route.bus.laneCount
    const minCount = Math.max(1, Math.ceil(laneCount / 4))
    const maxCount = Math.max(minCount, Math.floor(laneCount / 2))
    const count =
      minCount + Math.floor(random(seed) * (maxCount - minCount + 1))
    const rotation = Math.floor(random(seed + 73) * laneCount)
    // The stride must be coprime to the lane count so every trace is eligible.
    const stride = laneCount % 5 === 0 ? laneCount - 1 : 5
    if ((route.lane * stride + rotation) % laneCount >= count) continue
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

// Broad excursions use long legs, not repeated small zigzags. Eight turns form
// an open octagonal loop; twelve add a return leg that travels back across it.
const LOOP_SHAPES = [
  {
    turns: 4,
    width: 224,
    depth: 64,
    points: [
      [0, 0],
      [64, 64],
      [160, 64],
      [224, 0],
    ],
  },
  {
    turns: 8,
    width: 176,
    depth: 112,
    points: [
      [0, 0],
      [24, 24],
      [24, 88],
      [48, 112],
      [128, 112],
      [152, 88],
      [152, 24],
      [176, 0],
    ],
  },
  {
    turns: 12,
    width: 232,
    depth: 224,
    points: [
      [104, 0],
      [128, 24],
      [128, 88],
      [104, 112],
      [24, 112],
      [0, 136],
      [0, 200],
      [24, 224],
      [184, 224],
      [208, 200],
      [208, 24],
      [232, 0],
    ],
  },
]

function addRunLoops(points, width, height, turns, bendDirection, layout) {
  if (!turns || !bendDirection) return points
  const [fromX, y] = points.at(-2)
  const direction = Math.sign(points.at(-1)[0] - fromX)
  const startX =
    direction > 0
      ? Math.max(0, fromX) + layout.runMargin
      : Math.min(width, fromX) - layout.runMargin
  const available =
    direction > 0
      ? width - layout.runMargin - startX
      : startX - layout.runMargin
  const clearance =
    bendDirection > 0 ? height - layout.edgeMargin - y : y - layout.edgeMargin
  const shapes = layout.shapes.filter((shape) => shape.depth <= clearance)
  // Choose the most turns that fit, preferring complete loops over several
  // shallow detours. Increasing the slider never removes turns from a route.
  let best = { shapes: [], turns: 0, width: 0, quality: 0 }
  const fit = (plan) => {
    if (
      plan.turns > best.turns ||
      (plan.turns === best.turns && plan.quality > best.quality)
    )
      best = plan
    for (const shape of shapes) {
      const nextWidth =
        plan.width + shape.width + (plan.shapes.length ? layout.gap : 0)
      if (plan.turns + shape.turns > turns || nextWidth > available) continue
      fit({
        shapes: [...plan.shapes, shape],
        turns: plan.turns + shape.turns,
        width: nextWidth,
        quality: plan.quality + shape.turns ** 2,
      })
    }
  }
  fit(best)
  if (!best.turns) return points
  const gaps = (best.shapes.length - 1) * layout.gap
  const scale = Math.min(
    1.75,
    (available - gaps) / (best.width - gaps),
    ...best.shapes.map((shape) => clearance / shape.depth),
  )
  const occupied = (best.width - gaps) * scale + gaps
  let cursor = (available - occupied) / 2
  const result = points.slice(0, -1)
  for (const shape of best.shapes) {
    for (const [x, dy] of shape.points) {
      result.push([
        startX + direction * (cursor + x * scale),
        y + bendDirection * dy * scale,
      ])
    }
    cursor += shape.width * scale + layout.gap
  }
  result.push(points.at(-1))
  return result
}

export function createCircuitBuses(
  width,
  height,
  extraTurns = 8,
  busCount = 16,
  tracesPerBus = 16,
) {
  const turns = Number.isFinite(extraTurns)
    ? Math.max(0, Math.min(24, Math.round(extraTurns / 4) * 4))
    : 8
  const laneCount = Number.isFinite(tracesPerBus)
    ? Math.max(1, Math.min(32, Math.round(tracesPerBus)))
    : 16
  const halfWidth = ((laneCount - 1) * LANE_SPACING) / 2
  const edgeMargin = Math.max(44, halfWidth + 14)
  const rowMargin = edgeMargin + 32
  // Wider bundles need larger inner corners and more clearance at screen edges.
  const loopScale = Math.max(1, (laneCount - 1) / 15)
  const layout = {
    edgeMargin,
    runMargin: Math.max(40, halfWidth + 10),
    gap: Math.max(80, halfWidth * 2 + 20),
    shapes: LOOP_SHAPES.map((shape) => ({
      ...shape,
      width: shape.width * loopScale,
      depth: shape.depth * loopScale,
      points: shape.points.map(([x, y]) => [x * loopScale, y * loopScale]),
    })),
  }
  const sideCount = Math.floor(laneCount / 4)
  const groupOf = (lane) => Math.floor((lane * 4) / laneCount)
  const routes = []
  const count = Number.isFinite(busCount)
    ? Math.max(0, Math.min(40, Math.round(busCount)))
    : 16
  const naturalRows = Math.max(
    2,
    Math.ceil((height - rowMargin * 2) / BUS_ROW_SPACING) + 1,
  )
  const naturalTopEntries = Math.max(1, Math.ceil(width / 400))
  let topEntries =
    count > 1
      ? Math.max(
          1,
          Math.round(
            (count * naturalTopEntries) / (naturalRows + naturalTopEntries),
          ),
        )
      : 0
  // Preserve full-height row coverage when the requested count allows it.
  if (count > naturalRows)
    topEntries = Math.min(topEntries, count - naturalRows)
  const rows = count - topEntries
  const addBus = (lanePaths, seed, id, branchDirections, mirror = false) => {
    const bus = { id, seed, laneCount, phase: (seed * 0.61803398875) % 1 }
    const vertical = lanePaths[0][0][0] === lanePaths[0][1][0]
    let prefix = [lanePaths[0][0]]
    if (vertical) {
      const entryX = lanePaths[0][0][0]
      const firstFork = Math.min(...lanePaths.map((points) => points[1][1]))
      // A tall mobile viewport has room for a broad loop in the incoming trunk
      // even when its side-exit runs are too short. Keep it above every fork.
      prefix = addRunLoops(
        [
          [firstFork, entryX],
          [-64, entryX],
        ],
        height,
        width,
        turns,
        entryX < width / 2 ? 1 : -1,
        layout,
      )
        .reverse()
        .slice(0, -1)
        .map(([y, x]) => [x, y])
    }
    // A loop in the incoming trunk can occupy the same area as an upper exit
    // branch. Keep each bus's loops either before its forks or beyond them.
    const remainingTurns = prefix.length > 1 ? 0 : turns
    const lanes = lanePaths.map((points, lane) => {
      // Outer branches loop away from their siblings. The through trunk keeps
      // the original coverage, and every branch stays parallel.
      let offset = offsetPoints(
        addRunLoops(
          [...prefix, ...points.slice(1)],
          width,
          height,
          remainingTurns,
          branchDirections[lane],
          layout,
        ),
        (lane - (laneCount - 1) / 2) * LANE_SPACING,
      )
      if (mirror) offset = offset.map(([x, y]) => [width - x, y])
      return { bus, lane, ...segmentsOf(offset) }
    })
    bus.maxLength = Math.max(...lanes.map((route) => route.length))
    routes.push(...lanes)
  }
  // The outer quarters peel away while the middle traces continue onward.
  // Small buses keep at least one continuous through trace.
  for (let row = 0; row < rows; row++) {
    const y =
      rows === 1
        ? height / 2
        : rowMargin + ((height - rowMargin * 2) * row) / (rows - 1)
    const upperY = Math.max(edgeMargin, y - 64 - random(row * 13 + 5) * 56)
    const lowerY = Math.min(
      height - edgeMargin,
      y + 64 + random(row * 23 + 7) * 56,
    )
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
      Array.from({ length: laneCount }, (_, lane) =>
        lane < sideCount
          ? upper
          : lane >= laneCount - sideCount
            ? lower
            : trunk,
      ),
      row * 17 + 1,
      `horizontal:${row}`,
      Array.from({ length: laneCount }, (_, lane) =>
        lane < sideCount ? -1 : lane >= laneCount - sideCount ? 1 : 0,
      ),
      row % 2 === 1,
    )
  }
  // Vertical trunks fan out in up to four groups at separate depths. Outer
  // groups peel away first, leaving the inner wires to continue down the trunk.
  for (let index = 0; index < topEntries; index++) {
    const entryX = Math.max(
      halfWidth + 8,
      Math.min(width - halfWidth - 8, ((index + 0.5) * width) / topEntries),
    )
    const branches = Array.from({ length: 4 }, (_, group) => {
      const direction = group < 2 ? 1 : -1
      const inner = group === 1 || group === 2
      const exitY =
        height *
        ((inner ? (width < 640 ? 0.72 : 0.52) : width < 640 ? 0.48 : 0.24) +
          random(index * 37 + group * 11) * (width < 640 ? 0.1 : 0.16))
      const diagonal = Math.min(72, width * 0.15)
      return [
        [entryX, -64],
        [entryX, exitY - diagonal],
        [entryX + direction * diagonal, exitY],
        [direction === 1 ? width + 64 : -64, exitY],
      ]
    })
    addBus(
      Array.from({ length: laneCount }, (_, lane) => branches[groupOf(lane)]),
      index * 31 + 27,
      `top-to-side:${index}`,
      Array.from({ length: laneCount }, (_, lane) =>
        groupOf(lane) === 0 || groupOf(lane) === 3 ? -1 : 1,
      ),
    )
  }
  return routes
}
