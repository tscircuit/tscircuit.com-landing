import { initHeroCircuitBackground } from "./hero-circuit-background.js"

const STORAGE_KEY = "tscircuit-signal-settings-v1"
const DEFAULTS = {
  speed: 600,
  length: 240,
  density: 10,
  strokeWidth: 0.7,
  showAll: false,
}

export function initHeroCircuitControls(background, controls) {
  const fields = Object.keys(DEFAULTS).filter(
    (key) => typeof DEFAULTS[key] === "number",
  )
  const ranges = Object.fromEntries(
    fields.map((key) => [key, controls.querySelector(`#signal-${key}`)]),
  )
  const numbers = Object.fromEntries(
    fields.map((key) => [key, controls.querySelector(`#signal-${key}-number`)]),
  )
  const normalize = (key, value) => {
    const input = ranges[key]
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return DEFAULTS[key]
    const step = Number(input.step)
    const clamped = Math.min(
      Number(input.max),
      Math.max(Number(input.min), parsed),
    )
    return Number((Math.round(clamped / step) * step).toFixed(2))
  }
  let settings = { ...DEFAULTS }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (typeof saved?.showAll === "boolean") settings.showAll = saved.showAll
    for (const key of fields) {
      if (typeof saved?.[key] === "number")
        settings[key] = normalize(key, saved[key])
    }
  } catch {
    // The controls still work when local storage is unavailable.
  }

  const animation = initHeroCircuitBackground(background, settings)
  const showAll = controls.querySelector("#signal-show-all")
  const output = controls.querySelector("#signal-settings")
  const status = controls.querySelector("#signal-copy-status")
  const render = () => {
    for (const key of fields) {
      ranges[key].value = settings[key]
      numbers[key].value = settings[key]
    }
    showAll.checked = settings.showAll
    output.value = JSON.stringify(settings)
  }
  const update = (key, value) => {
    settings[key] = key === "showAll" ? Boolean(value) : normalize(key, value)
    animation?.setSettings(settings)
    render()
    status.textContent = ""
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // Persistence is optional; live changes and copying do not depend on it.
    }
  }

  showAll.addEventListener("change", () => update("showAll", showAll.checked))
  for (const key of fields) {
    ranges[key].addEventListener("input", () => update(key, ranges[key].value))
    numbers[key].addEventListener("input", () => {
      if (numbers[key].value !== "" && numbers[key].validity.valid) {
        update(key, numbers[key].value)
      }
    })
    numbers[key].addEventListener("change", () =>
      update(key, numbers[key].value),
    )
  }
  controls.querySelector("#signal-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output.value)
      status.textContent = "Copied settings"
    } catch {
      output.focus()
      output.select()
      status.textContent = "Select and copy the settings below."
    }
  })
  controls.querySelector("#signal-reset").addEventListener("click", () => {
    settings = { ...DEFAULTS }
    update("speed", settings.speed)
  })
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
  const updateMotionNote = () => {
    controls.querySelector("#signal-motion-note").hidden =
      !reducedMotion.matches
  }
  reducedMotion.addEventListener("change", updateMotionNote)
  updateMotionNote()
  render()
  new ResizeObserver(() => {
    document.body.style.setProperty(
      "--signal-controls-height",
      `${controls.getBoundingClientRect().height}px`,
    )
  }).observe(controls)
}
