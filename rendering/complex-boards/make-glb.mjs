import { readFile, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const [sourcePath, outputPath, solderMask, silkscreen] = process.argv.slice(2)
const { convertCircuitJsonTo3D, convertSceneToGLTF } = await import(
  pathToFileURL(process.env.CIRCUIT_JSON_TO_GLTF_DIST).href
)
const circuitJson = JSON.parse(await readFile(sourcePath, "utf8"))
const recolored = circuitJson.map((element) => {
  if (element.type !== "pcb_board") return element
  const board = { ...element }
  if (solderMask) {
    board.solder_mask_color = solderMask
    delete board.soldermask_color
  }
  if (silkscreen) board.silkscreen_color = silkscreen
  return board
})
const t0 = Date.now()
const scene = await convertCircuitJsonTo3D(recolored, {
  componentColor: "#f4f5f7",
  copperColor: "#d7b56d",
  drillColor: "#11151d",
  boardDrillQuality: "high",
  boardSurfaceMode: "realistic",
  renderBoardTextures: true,
  textureResolution: 2048,
  showBoundingBoxes: false,
})
const glb = await convertSceneToGLTF(scene, { binary: true, embedImages: true })
await writeFile(outputPath, new Uint8Array(glb))
console.log(`Wrote ${outputPath} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
