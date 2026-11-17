#!/bin/sh
# Download the Circuit JSON for each board in the hero from the tscircuit registry.
# Usage: rendering/complex-boards/fetch-circuit-json.sh <output-dir>
set -e
OUT="${1:?output dir}"
API=https://registry-api.tscircuit.com
mkdir -p "$OUT"
while read -r pkg path; do
  [ -z "$pkg" ] && continue
  file="$OUT/$(echo "$pkg" | sed 's#/#__#').json"
  curl -sf -G "$API/package_files/get" --data-urlencode "package_name=$pkg" --data-urlencode "file_path=$path" |
    bun -e 'const r = await Bun.stdin.json(); if (!r.ok) throw new Error(JSON.stringify(r)); process.stdout.write(r.package_file.content_text)' > "$file"
  echo "wrote $file"
done <<'BOARDS'
seveibar/am3352-dev-board-4layer-dogbone dist/index/circuit.json
krishnax12/t113-minimal-linux dist/routed/circuit.json
rushabhcodes/sbc_allwinner_v3s dist/index/circuit.json
abse/boostxl-audio dist/index/circuit.json
mohan-bee/drone dist/index/circuit.json
mohan-bee/flight-controller-v2 dist/assembly/circuit.json
mohan-bee/gimbal-one-budget-pcb dist/assembly-reviewed/circuit.json
astra/nema17-stepper-motor-controller-spring-clamp-rp2040 dist/index/circuit.json
seveibar/nema17-stepper-motor-driver-tmc2209-usb-pd dist/index/circuit.json
BOARDS
