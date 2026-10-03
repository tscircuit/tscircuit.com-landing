import assert from "node:assert/strict"
import test from "node:test"
import {
  createCircuitBuses,
  getSignalStates,
} from "../assets/hero-circuit-routing.js"

const cross = (ax, ay, bx, by) => ax * by - ay * bx
const intersects = (a, b) => {
  const ax = a.x - a.fromX
  const ay = a.y - a.fromY
  const bx = b.x - b.fromX
  const by = b.y - b.fromY
  const determinant = cross(ax, ay, bx, by)
  if (Math.abs(determinant) < 1e-6) return false
  const dx = b.fromX - a.fromX
  const dy = b.fromY - a.fromY
  const t = cross(dx, dy, bx, by) / determinant
  const u = cross(dx, dy, ax, ay) / determinant
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

const routes = createCircuitBuses(1440, 697)
const settings = { length: 240, density: 2000 }

const viewports = [
  [320, 1000],
  [390, 1080],
  [768, 1140],
  [1440, 1030],
  [2560, 1030],
  [3440, 1030],
]

const geometryCases = viewports.flatMap(([width, height]) =>
  [0, 4, 8, 12, 16, 20, 24].map((turns) => [width, height, turns]),
)

test("buses cover the full section without broad permanent gaps", () => {
  for (const [width, height, turns] of geometryCases) {
    const segments = createCircuitBuses(width, height, turns).flatMap(
      (route) => route.segments,
    )
    for (let x = 0; x <= width; x += 24) {
      for (let y = 0; y <= height; y += 24) {
        const covered = segments.some((segment) => {
          const dx = segment.x - segment.fromX
          const dy = segment.y - segment.fromY
          const t = Math.max(
            0,
            Math.min(
              1,
              ((x - segment.fromX) * dx + (y - segment.fromY) * dy) /
                segment.distance ** 2,
            ),
          )
          return (
            Math.hypot(
              x - segment.fromX - t * dx,
              y - segment.fromY - t * dy,
            ) <= 80
          )
        })
        assert.ok(covered, `uncovered area at ${x},${y} in ${width}×${height}`)
      }
    }
  }
})

test("all lanes enter from an edge, use 45-degree bends, and exit a side", () => {
  for (const [width, height, turns] of geometryCases) {
    for (const route of createCircuitBuses(width, height, turns)) {
      const first = route.segments[0]
      const last = route.segments.at(-1)
      assert.ok(first.fromX < 0 || first.fromX > width || first.fromY < 0)
      assert.ok(last.x < 0 || last.x > width)
      for (const segment of route.segments) {
        assert.ok(Number.isFinite(segment.distance) && segment.distance > 0)
        assert.ok(segment.fromY < height && segment.y < height)
        const dx = Math.abs(segment.x - segment.fromX)
        const dy = Math.abs(segment.y - segment.fromY)
        assert.ok(dx < 1e-6 || dy < 1e-6 || Math.abs(dx - dy) < 1e-6)
      }
    }
  }
})

test("high density starts empty and keeps every signal inside its route", () => {
  for (const route of routes) {
    assert.deepEqual(getSignalStates(route, 0, settings), [])
    for (const distance of [100, 1000, 10000, 1e9]) {
      const signals = getSignalStates(route, distance, settings)
      assert.ok(signals.length <= 20)
      for (const signal of signals) {
        assert.ok(signal.start >= 0)
        assert.ok(signal.end <= route.length)
        assert.ok(signal.end > signal.start)
        assert.ok(signal.end - signal.start <= settings.length + 1e-6)
      }
    }
  }
})

test("signals survive later emission boundaries until their tails exit", () => {
  let checked = 0
  for (const route of routes) {
    const cycle = (route.bus.maxLength * 1.75 + settings.length) / 20
    const boundary = route.bus.phase * 80 + cycle * 12
    const before = getSignalStates(route, boundary - 0.5, settings)
    const after = getSignalStates(route, boundary + 0.5, settings)
    for (const signal of before) {
      if (signal.end >= route.length - 1) continue
      const expectedEnd = signal.end + 1
      const expectedStart = Math.max(0, expectedEnd - settings.length)
      assert.ok(
        after.some(
          (next) =>
            Math.abs(next.start - expectedStart) < 1e-6 &&
            Math.abs(next.end - expectedEnd) < 1e-6,
        ),
        "an in-flight signal disappeared when a new emission started",
      )
      checked++
    }
  }
  assert.ok(checked > 0)
})

test("2000% produces substantially more concurrent signals than 100%", () => {
  const totals = [100, 2000].map((density) => {
    let total = 0
    for (let distance = 10000; distance < 50000; distance += 100) {
      for (const route of routes) {
        total += getSignalStates(route, distance, {
          ...settings,
          density,
        }).length
      }
    }
    return total
  })
  assert.ok(totals[0] > 0)
  assert.ok(totals[1] > totals[0] * 15)
})

test("forks conserve the 16 wires and never cross wires within a bus", () => {
  for (const [width, height, turns] of geometryCases) {
    const allRoutes = createCircuitBuses(width, height, turns)
    for (const bus of new Set(allRoutes.map((route) => route.bus))) {
      const lanes = allRoutes.filter((route) => route.bus === bus)
      assert.equal(lanes.length, 16)
      assert.equal(new Set(lanes.map((route) => route.lane)).size, 16)
      for (let i = 1; i < lanes.length; i++) {
        const a = lanes[i - 1].segments[0]
        const b = lanes[i].segments[0]
        assert.ok(
          Math.abs(Math.hypot(a.fromX - b.fromX, a.fromY - b.fromY) - 4) < 1e-6,
        )
      }
      const exits = lanes.map((route) => route.segments.at(-1))
      if (bus.id.startsWith("horizontal:")) {
        // Two four-wire groups leave an eight-wire trunk, at distinct heights.
        const sortedY = exits.map((segment) => segment.y).sort((a, b) => a - b)
        const groups = [1]
        for (let i = 1; i < sortedY.length; i++) {
          if (sortedY[i] - sortedY[i - 1] > 8) groups.push(1)
          else groups[groups.length - 1]++
        }
        assert.deepEqual(groups, [4, 8, 4])
      } else {
        assert.equal(exits.filter((segment) => segment.x < 0).length, 8)
        assert.equal(exits.filter((segment) => segment.x > width).length, 8)
      }
      for (let i = 0; i < lanes.length; i++) {
        for (let j = i + 1; j < lanes.length; j++) {
          assert.ok(
            !lanes[i].segments.some((a) =>
              lanes[j].segments.some((b) => intersects(a, b)),
            ),
            `${bus.id} crosses lanes ${i}/${j} at ${width}px`,
          )
        }
      }
    }
  }
})

test("turns add bends without changing wire endpoints or exceeding the setting", () => {
  for (const [width, height] of viewports) {
    const base = createCircuitBuses(width, height, 0)
    let previousTotal = 0
    for (const turns of [4, 8, 12, 16, 20, 24]) {
      const next = createCircuitBuses(width, height, turns)
      let total = 0
      for (let index = 0; index < base.length; index++) {
        const before = base[index].segments
        const after = next[index].segments
        const added = after.length - before.length
        assert.ok(added >= 0 && added <= turns && added % 4 === 0)
        assert.equal(after[0].fromX, before[0].fromX)
        assert.equal(after[0].fromY, before[0].fromY)
        assert.equal(after.at(-1).x, before.at(-1).x)
        assert.equal(after.at(-1).y, before.at(-1).y)
        total += added
      }
      assert.ok(total > 0, `turns must have a visible effect at ${width}px`)
      assert.ok(total >= previousTotal)
      if (width >= 1440) assert.ok(total > previousTotal)
      previousTotal = total
    }
  }
})

test("large bends form broad loops with long legs and reverse-running returns", () => {
  for (const [width, height] of viewports) {
    const base = createCircuitBuses(width, height, 0)
    const looped = createCircuitBuses(width, height, 8)
    let excursion = 0
    for (let i = 0; i < looped.length; i++) {
      for (const point of looped[i].segments) {
        const distance = Math.min(
          ...base[i].segments.map((segment) => {
            const dx = segment.x - segment.fromX
            const dy = segment.y - segment.fromY
            const t = Math.max(
              0,
              Math.min(
                1,
                ((point.x - segment.fromX) * dx +
                  (point.y - segment.fromY) * dy) /
                  segment.distance ** 2,
              ),
            )
            return Math.hypot(
              point.x - segment.fromX - t * dx,
              point.y - segment.fromY - t * dy,
            )
          }),
        )
        excursion = Math.max(excursion, distance)
      }
    }
    assert.ok(
      excursion >= 100,
      `loops should leave the original route by at least 100px at ${width}px`,
    )
  }
  const returns = createCircuitBuses(2560, 1030, 12).filter((route) => {
    if (!route.bus.id.startsWith("horizontal:")) return false
    const direction = Math.sign(route.segments[0].x - route.segments[0].fromX)
    return route.segments.some(
      (segment) => (segment.x - segment.fromX) * direction < -70,
    )
  })
  assert.ok(
    returns.length >= 16,
    "multiple branches should double back on long return legs",
  )
  for (const route of createCircuitBuses(2560, 1030, 24)) {
    for (let i = 1; i < route.segments.length; i++) {
      const a = route.segments[i - 1]
      const b = route.segments[i]
      const cosine =
        ((a.x - a.fromX) * (b.x - b.fromX) +
          (a.y - a.fromY) * (b.y - b.fromY)) /
        (a.distance * b.distance)
      assert.ok(
        Math.abs(cosine - Math.SQRT1_2) < 1e-6,
        "every successive corner must turn exactly 45 degrees",
      )
    }
  }
})

test("bus count creates exactly the requested number of complete bundles at every size", () => {
  for (const [width, height] of viewports) {
    for (let count = 0; count <= 40; count++) {
      const routes = createCircuitBuses(width, height, 8, count)
      const buses = new Set(routes.map((route) => route.bus))
      assert.equal(buses.size, count)
      assert.equal(routes.length, count * 16)
      for (const bus of buses) {
        const lanes = routes.filter((route) => route.bus === bus)
        assert.equal(new Set(lanes.map((route) => route.lane)).size, 16)
        assert.ok(Number.isFinite(bus.maxLength) && bus.maxLength > 0)
      }
      for (const route of routes) {
        for (const segment of route.segments) {
          assert.ok(Number.isFinite(segment.distance) && segment.distance > 0)
          assert.ok(segment.fromY < height && segment.y < height)
        }
      }
    }
  }
})

test("bus count handles zero, a single centered bus, and out-of-range values", () => {
  assert.deepEqual(createCircuitBuses(1440, 1030, 24, 0), [])
  const single = createCircuitBuses(1440, 1030, 0, 1)
  assert.equal(
    (single[0].segments[0].fromY + single[15].segments[0].fromY) / 2,
    515,
  )
  for (const [input, expected] of [
    [-5, 0],
    [100, 40],
    [2.7, 3],
    [NaN, 16],
    [Infinity, 16],
  ]) {
    assert.equal(createCircuitBuses(1440, 1030, 8, input).length, expected * 16)
  }
})

test("trace count preserves spacing and noncrossing forks for small, odd, and wide buses", () => {
  for (const [width, height] of viewports) {
    for (let count = 1; count <= 32; count++) {
      for (const turns of [0, 8, 24]) {
        const routes = createCircuitBuses(width, height, turns, 16, count)
        assert.equal(routes.length, 16 * count)
        for (const bus of new Set(routes.map((route) => route.bus))) {
          const lanes = routes.filter((route) => route.bus === bus)
          assert.equal(bus.laneCount, count)
          assert.deepEqual(
            lanes.map((route) => route.lane),
            Array.from({ length: count }, (_, i) => i),
          )
          for (let i = 0; i < lanes.length; i++) {
            const segments = lanes[i].segments
            assert.ok(segments.at(-1).x < 0 || segments.at(-1).x > width)
            for (const segment of segments) {
              assert.ok(
                Number.isFinite(segment.distance) && segment.distance > 0,
              )
              assert.ok(segment.fromY < height && segment.y < height)
              const dx = Math.abs(segment.x - segment.fromX)
              const dy = Math.abs(segment.y - segment.fromY)
              assert.ok(dx < 1e-6 || dy < 1e-6 || Math.abs(dx - dy) < 1e-6)
            }
            if (i > 0) {
              const a = lanes[i - 1].segments[0]
              const b = segments[0]
              assert.ok(
                Math.abs(Math.hypot(a.fromX - b.fromX, a.fromY - b.fromY) - 4) <
                  1e-6,
              )
            }
            for (let j = i + 1; j < lanes.length; j++) {
              assert.ok(
                !segments.some((a) =>
                  lanes[j].segments.some((b) => intersects(a, b)),
                ),
                `${bus.id} crosses lanes ${i}/${j} with ${count} traces, ${turns} turns at ${width}px`,
              )
            }
          }
        }
      }
    }
  }
})

test("every trace can receive signals with any bundle size, including a single trace", () => {
  const settings = { length: 600, density: 100 }
  for (let count = 1; count <= 32; count++) {
    const bus = { maxLength: 1000, seed: 1, phase: 0, laneCount: count }
    const seen = new Set()
    for (let emission = 0; emission < 128; emission++) {
      let active = 0
      for (let lane = 0; lane < count; lane++) {
        const signals = getSignalStates(
          { bus, lane, length: 1000 },
          emission * 2350 + 1000,
          settings,
        )
        if (signals.length) {
          active++
          seen.add(lane)
        }
      }
      assert.ok(active >= Math.max(1, Math.ceil(count / 4)))
      assert.ok(active <= Math.max(1, Math.floor(count / 2)))
    }
    assert.equal(seen.size, count)
  }
})

test("trace count clamps invalid settings and works independently of bus count", () => {
  for (const [input, expected] of [
    [0, 1],
    [-5, 1],
    [100, 32],
    [2.7, 3],
    [NaN, 16],
    [Infinity, 16],
  ]) {
    assert.equal(
      createCircuitBuses(1440, 1030, 8, 7, input).length,
      7 * expected,
    )
  }
  assert.deepEqual(createCircuitBuses(1440, 1030, 8, 0, 32), [])
  assert.equal(createCircuitBuses(1440, 1030, 8, 40, 32).length, 1280)
})
