import assert from "node:assert/strict"
import test from "node:test"
import {
  createCircuitBuses,
  getSignalStates,
} from "../assets/hero-circuit-routing.js"

const routes = createCircuitBuses(1440, 697)
const settings = { length: 240, density: 2000 }

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
