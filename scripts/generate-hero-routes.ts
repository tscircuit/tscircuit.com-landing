import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const SAMPLES = ["control", "right", "left", "above"]
const LAYERS = ["inner1", "inner2", "bottom"]
const TOLERANCE_MM = 0.01

// Subpixel polyline simplification for display only; retain routed bends and meanders.
function simplify(points: number[][]) {
  const retained = new Set([0, points.length - 1])
  const pending = [[0, points.length - 1]]
  while (pending.length) {
    const [first, last] = pending.pop()!
    const [x, y] = points[first]
    const dx = points[last][0] - x
    const dy = points[last][1] - y
    const squaredLength = dx * dx + dy * dy
    let greatest = TOLERANCE_MM ** 2
    let selected = -1
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i]
      const t = squaredLength
        ? Math.max(
            0,
            Math.min(1, ((px - x) * dx + (py - y) * dy) / squaredLength),
          )
        : 0
      const error = (px - x - t * dx) ** 2 + (py - y - t * dy) ** 2
      if (error > greatest) {
        greatest = error
        selected = i
      }
    }
    if (selected >= 0) {
      retained.add(selected)
      pending.push([first, selected], [selected, last])
    }
  }
  return [...retained]
    .sort((a, b) => a - b)
    .map((index) => points[index].map((value) => Number(value.toFixed(3))))
}

export function extractLayers(samples: any[], revision: string) {
  if (
    samples.length !== 4 ||
    samples.some((sample, i) => sample.name !== SAMPLES[i])
  )
    throw Error("Expected four AM3352 placements in order")
  const layers = []
  for (const sample of samples) {
    if (
      sample.traces.length !== 47 ||
      !sample.validation.valid ||
      !sample.validation.complete ||
      !sample.validation.matched ||
      !sample.validation.combinedDrc.valid
    )
      throw Error(`Incomplete source: ${sample.name}`)
    const { x, y } = sample.placement.ram
    const distance = Math.hypot(x, y)
    const ux = x / distance
    const uy = y / distance
    for (const layer of LAYERS) {
      const traces = []
      for (const trace of sample.traces) {
        const firstVia = trace.route.findIndex(
          (point: any) => point.route_type === "via",
        )
        if (trace.route[firstVia + 1]?.layer !== layer) continue
        const wires = trace.route.filter(
          (point: any) => point.route_type === "wire" && point.layer === layer,
        )
        if (wires.length < 2) throw Error("Missing carrier geometry")
        // Rigid rotation to a common SoC-to-RAM axis; no independent X/Y scaling.
        let points = wires.map((point: any) => [
          point.x * ux + point.y * uy,
          -point.x * uy + point.y * ux,
        ])
        if (points[0][0] > points.at(-1)[0]) points.reverse()
        points = simplify(points)
        traces.push({ id: trace.connection_name, points })
      }
      if (!traces.length)
        throw Error(`Empty source layer: ${sample.name}/${layer}`)
      const points = traces.flatMap((trace) => trace.points)
      layers.push({
        id: `${sample.name}/${layer}`,
        sample: sample.name,
        layer,
        bounds: [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
        traces,
      })
    }
  }
  if (layers.reduce((count, layer) => count + layer.traces.length, 0) !== 188)
    throw Error("Expected all 188 carrier traces across twelve layers")
  return {
    source: {
      repository: "https://github.com/tscircuit/bus-lanes-solver",
      revision,
      samples: SAMPLES,
      signalLayers: LAYERS,
      simplificationToleranceMm: TOLERANCE_MM,
      coordinatePrecisionMm: 0.001,
      license: "MIT; see am3352-routes-license.txt",
      validation: samples.map((sample) => ({
        sample: sample.name,
        signals: sample.traces.length,
        connectivity: sample.validation.complete,
        drc: sample.validation.combinedDrc.valid,
        lengthMatching: sample.validation.matched,
        sourceTracesSha256: createHash("sha256")
          .update(JSON.stringify(sample.traces))
          .digest("hex"),
      })),
    },
    layers,
  }
}

if (import.meta.main) {
  const repository = resolve(process.argv[2] ?? "../bus-lanes-solver")
  const { BusLanesPipelineSolver } = await import(
    pathToFileURL(resolve(repository, "lib/index.ts")).href
  )
  const { loadAm3352Sample } = await import(
    pathToFileURL(resolve(repository, "scripts/am3352-samples.ts")).href
  )
  const { validateAm3352Sample, validateAm3352OutputShape } = await import(
    pathToFileURL(resolve(repository, "scripts/validate-am3352-sample.ts")).href
  )
  const revision = execFileSync(
    "git",
    ["-C", repository, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim()
  const samples = []
  for (const name of SAMPLES) {
    const { input, metadata } = await loadAm3352Sample(name)
    const solver = new BusLanesPipelineSolver(input)
    const start = performance.now()
    while (!solver.solved && !solver.failed) {
      if (performance.now() - start > 240000)
        throw Error(`${name}: solver timeout`)
      solver.step()
    }
    if (!solver.solved || solver.failed) throw Error(`${name}: ${solver.error}`)
    validateAm3352OutputShape(
      input,
      metadata,
      solver.traces,
      solver.getOutput(),
    )
    const validation = await validateAm3352Sample(
      input,
      metadata,
      solver.traces,
    )
    samples.push({
      name,
      placement: metadata.placement,
      traces: solver.traces,
      validation,
    })
    console.log(`${name}: ${solver.traces.length} routed signals`)
  }
  // Write only once all four successfully solved and passed source validation.
  await Bun.write(
    new URL("../assets/am3352-routes.json", import.meta.url),
    JSON.stringify(extractLayers(samples, revision)),
  )
}
