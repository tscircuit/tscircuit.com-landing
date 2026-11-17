# Complex-boards hero render

`assets/hero-complex-boards.webp` is a Cycles render of nine complex, fully
routed boards from the tscircuit registry, placed at true relative scale on a
shadow-catcher floor (so the soft shadows are part of the transparent image).

| Board | Registry package |
| --- | --- |
| AM3352 4-layer dogbone dev board | `seveibar/am3352-dev-board-4layer-dogbone` |
| T113 minimal Linux board | `krishnax12/t113-minimal-linux` |
| Allwinner V3s SBC | `rushabhcodes/sbc_allwinner_v3s` |
| BOOSTXL audio | `abse/boostxl-audio` |
| Drone | `mohan-bee/drone` |
| Flight controller v2 | `mohan-bee/flight-controller-v2` |
| Gimbal One | `mohan-bee/gimbal-one-budget-pcb` |
| NEMA17 spring-clamp RP2040 controller | `astra/nema17-stepper-motor-controller-spring-clamp-rp2040` |
| NEMA17 TMC2209 USB-PD driver | `seveibar/nema17-stepper-motor-driver-tmc2209-usb-pd` |

Boards were picked by routing complexity (trace, pad and via counts in each
package's PCB preview) and by having interesting 3D parts.

## Regenerate

1. Download the Circuit JSON (needs `bun`):

   ```sh
   rendering/complex-boards/fetch-circuit-json.sh /tmp/hero-circuit-json
   ```

2. Build the pinned exporter described in
   [../hero-boards/GLB_REGENERATION.md](../hero-boards/GLB_REGENERATION.md)
   (`circuit-json-to-gltf` at `d95429b`), then convert each board, keeping its
   own solder-mask color and a white legend:

   ```sh
   mkdir -p rendering/complex-boards/models
   for f in /tmp/hero-circuit-json/*.json; do
     CIRCUIT_JSON_TO_GLTF_DIST=/path/to/circuit-json-to-gltf/dist/index.js \
       bun rendering/complex-boards/make-glb.mjs "$f" \
       "rendering/complex-boards/models/$(basename "$f" .json).glb" "" "#ffffff"
   done
   ```

   The GLBs total about 250 MB, so they are not checked in.

3. Render (Blender 4.2+). `layout.json` gives each board a target position in
   the frame (`screen`, normalized 0–1) plus height, rotation and tilt; the
   script solves for the floor position that puts the board there.

   ```sh
   blender --background --python rendering/complex-boards/render.py -- \
     --layout rendering/complex-boards/layout.json \
     --output /tmp/hero-complex-boards.png --engine cycles --samples 96
   ```

   Add `--engine cycles --samples 16 --scale 30` for a quick preview, or
   `--dry` to only print where each board lands in the frame.

4. Encode without any extra grading:

   ```sh
   magick /tmp/hero-complex-boards.png -depth 8 -quality 90 \
     -define webp:alpha-quality=100 -define webp:method=6 \
     -define webp:use-sharp-yuv=true assets/hero-complex-boards.webp
   ```
