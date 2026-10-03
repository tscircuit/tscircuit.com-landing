# tscircuit.com-landing

## Rebuilding the hero image

The Blender scene script, source GLB models, and reproduction instructions are
in [`rendering/hero-boards`](rendering/hero-boards/README.md).

## Hero circuit routes

`assets/am3352-routes.json` contains the **12 signal layers** (`inner1`, `inner2`,
`bottom`) from the AM3352 **control, right, left, and above** samples in
[bus-lanes-solver](https://github.com/tscircuit/bus-lanes-solver), revision
`0080afc423978cec297c9b9f3a9e44cf5e0ee1aa`. All four solves passed the source
connectivity, DRC, and length-matching checks: 47 signals each, 188 total.
The source revision, validation results, and original trace hashes are recorded
in the JSON; its MIT license is included alongside it.

To regenerate, check out that source revision, install its dependencies with
`bun install --frozen-lockfile`, then run from this repository:

```sh
bun scripts/generate-hero-routes.ts /path/to/bus-lanes-solver
bunx biome format --write assets/am3352-routes.json
```

The generator extracts carrier-layer wires without pad/via graphics and
simplifies their polylines at 0.01 mm tolerance for display. These are visual
assets, not manufacturing output. The browser uses uniform scaling, reflections,
and quarter turns to arrange all 12 layers. Wire endpoints extend to the top or
side edges so animated pulses enter and leave the canvas without fading. Every
exit is on a side edge. No solver runs in the browser.

The sticky signal controls persist locally and export their values as JSON.
**Show all buses fully drawn (no animation)** draws every route once and stops
animation frames; it also works when reduced motion is enabled. Animated mode
pauses when the hero is offscreen, the tab is hidden, or reduced motion is enabled.
