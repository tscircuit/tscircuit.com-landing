import routeData from "./am3352-routes.json"

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

function random(seed) {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x21f0aaad)
  value = Math.imul(value ^ (value >>> 16), 0x735a2d97)
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296
}

// Reserve enough time for the whole tail to exit before scheduling another emission.
export function getSignalState(route, distanceTraveled, settings) {
  const burstLength = route.bus.maxLength * 1.75 + settings.length
  const cycle = burstLength / (settings.density / 100)
  if (!cycle) return null
  // Start with an empty canvas; initial emissions also enter from an edge.
  const time = distanceTraveled - route.bus.phase * cycle
  if (time < 0) return null
  const emission = Math.floor(time / cycle)
  const seed = route.bus.seed + emission * 1013
  // Fire a different subset of each source layer, with independent lane delays.
  const { laneCount, stride } = route.bus
  const count = Math.max(
    1,
    Math.floor(laneCount * (0.25 + random(seed) * 0.25)),
  )
  const rotation = Math.floor(random(seed + 73) * laneCount)
  if ((route.lane * stride + rotation) % laneCount >= count) return null
  const delay = random(seed + route.lane * 53 + 137) * route.bus.maxLength * 0.7
  const head = (time % cycle) - delay
  if (head <= 0 || head >= route.length + settings.length) return null
  return {
    start: Math.max(0, head - settings.length),
    end: Math.min(route.length, head),
  }
}

// Coprime indexing spreads each emission across the source layer's actual lane count.
function laneStride(count) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a)
  let stride = 5
  while (gcd(stride, count) !== 1) stride++
  return stride
}

export function createCircuitBuses(width, height) {
  if (width <= 0 || height <= 0) return []
  const columns = width < 640 ? 2 : 3
  const rows = Math.ceil(routeData.layers.length / columns)
  const cellWidth = width / columns
  const cellHeight = (height - 48) / rows

  return routeData.layers.flatMap((layer, index) => {
    const [minU, minV, maxU, maxV] = layer.bounds
    const spanU = maxU - minU
    const spanV = maxV - minV
    const middleU = (minU + maxU) / 2
    const middleV = (minV + maxV) / 2
    const fromTop = index >= routeData.layers.length - 2
    const reflected = index % 2 === 0 ? 1 : -1
    // Only uniform scaling, quarter turns and reflections: preserve the routed geometry.
    const scale = fromTop
      ? Math.min((height * 0.5) / spanU, (width * 0.2) / spanV, 14)
      : Math.min((cellWidth * 0.9) / spanU, (cellHeight * 0.82) / spanV, 14)
    const centerX = fromTop
      ? width * (index % 2 === 0 ? 0.3 : 0.46)
      : ((index % columns) + 0.5) * cellWidth
    const centerY = fromTop
      ? height * 0.62
      : 24 + (Math.floor(index / columns) + 0.5) * cellHeight
    const bus = {
      id: layer.id,
      seed: index * 31 + 1,
      phase: (index * 0.61803398875) % 1,
      laneCount: layer.traces.length,
      stride: laneStride(layer.traces.length),
    }
    const routes = layer.traces.map((trace, lane) => {
      const points = trace.points.map(([u, v]) =>
        fromTop
          ? [
              centerX + (v - middleV) * scale * reflected,
              centerY + (u - middleU) * scale,
            ]
          : [
              centerX + (u - middleU) * scale,
              centerY + (v - middleV) * scale * reflected,
            ],
      )
      const first = points[0]
      const last = points[points.length - 1]
      // Source pads/vias are omitted. Extend their wire endpoints to the canvas edges
      // so every pulse enters and leaves physically, with no fading or interior births.
      points.unshift(fromTop ? [first[0], -32] : [-32, first[1]])
      points.push([width + 32, last[1]])
      if (!fromTop && index % 2 === 1) points.reverse()
      return { bus, lane, id: trace.id, ...segmentsOf(points) }
    })
    bus.maxLength = Math.max(...routes.map((route) => route.length))
    return routes
  })
}
