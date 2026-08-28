import { buildPalette, colorHex, type PixelData } from "./pixel"

export const outputFormats = ["compact-html", "single-html", "css-html", "jsx", "json"] as const
export type OutputFormat = (typeof outputFormats)[number]

export type ExportResult = {
  code: string
  extension: string
  language: string
  label: string
}

export const outputLabels: Record<OutputFormat, string> = {
  "compact-html": "압축 HTML",
  "single-html": "단일 요소 HTML",
  "css-html": "CSS + HTML",
  jsx: "React JSX",
  json: "Pixel JSON",
}

function safeName(name: string) {
  const normalized = name
    .replace(/\.png$/i, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
  return normalized || "pixel-art"
}

function componentName(name: string) {
  return safeName(name)
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("")
}

function compactHTML(image: PixelData, pixelSize: number) {
  const layers = buildPalette(image, pixelSize)
    .map(
      (layer) =>
        `<span style="position:absolute;inset:0 auto auto 0;width:${pixelSize}px;height:${pixelSize}px;color:${layer.color};box-shadow:${layer.coordinates.join(",")}"></span>`,
    )
    .join("")
  return `<div role="img" aria-label="pixel art" style="position:relative;width:${image.width * pixelSize}px;height:${image.height * pixelSize}px;overflow:visible">${layers}</div>`
}

function singleHTML(image: PixelData, pixelSize: number) {
  const shadows: string[] = []
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      if (image.data[offset + 3] === 0) continue
      shadows.push(`${x ? `${x * pixelSize}px` : 0} ${y ? `${y * pixelSize}px` : 0} 0 ${colorHex(image.data, offset)}`)
    }
  }
  return `<div role="img" aria-label="pixel art" style="width:${pixelSize}px;height:${pixelSize}px;margin:0 ${(image.width - 1) * pixelSize}px ${(image.height - 1) * pixelSize}px 0;box-shadow:${shadows.join(",")}"></div>`
}

function cssHTML(image: PixelData, pixelSize: number, name: string) {
  const className = `pixel-${safeName(name)}`
  const layers = buildPalette(image, pixelSize)
  const markup = `<div class="${className}" role="img" aria-label="pixel art">${layers.map((_, index) => `<i class="layer-${index}"></i>`).join("")}</div>`
  const rules = layers
    .map((layer, index) => `.${className} .layer-${index}{color:${layer.color};box-shadow:${layer.coordinates.join(",")}}`)
    .join("\n")
  const css = `.${className}{position:relative;width:${image.width * pixelSize}px;height:${image.height * pixelSize}px}\n.${className} i{position:absolute;inset:0 auto auto 0;width:${pixelSize}px;height:${pixelSize}px}\n${rules}`
  return `${markup}\n\n<style>\n${css}\n</style>`
}

function jsx(image: PixelData, pixelSize: number, name: string) {
  const layers = buildPalette(image, pixelSize).map((layer) => ({ color: layer.color, shadows: layer.coordinates.join(",") }))
  return `const layers = ${JSON.stringify(layers, null, 2)}\n\nexport default function ${componentName(name)}() {\n  return (\n    <div\n      role="img"\n      aria-label="pixel art"\n      style={{ position: "relative", width: ${image.width * pixelSize}, height: ${image.height * pixelSize} }}\n    >\n      {layers.map((layer) => (\n        <span\n          key={layer.color}\n          style={{\n            position: "absolute",\n            inset: "0 auto auto 0",\n            width: ${pixelSize},\n            height: ${pixelSize},\n            color: layer.color,\n            boxShadow: layer.shadows,\n          }}\n        />\n      ))}\n    </div>\n  )\n}`
}

function pixelJSON(image: PixelData, pixelSize: number) {
  return JSON.stringify(
    {
      version: 1,
      width: image.width,
      height: image.height,
      pixelSize,
      layers: buildPalette(image, 1).map((layer) => ({
        color: layer.color,
        pixels: layer.coordinates.map((coordinate) => coordinate.replaceAll("px", "").split(" ").map(Number)),
      })),
    },
    null,
    2,
  )
}

export function generateOutput(format: OutputFormat, image: PixelData, pixelSize: number, name: string): ExportResult {
  if (format === "compact-html") return { code: compactHTML(image, pixelSize), extension: "html", language: "html", label: outputLabels[format] }
  if (format === "single-html") return { code: singleHTML(image, pixelSize), extension: "html", language: "html", label: outputLabels[format] }
  if (format === "css-html") return { code: cssHTML(image, pixelSize, name), extension: "html", language: "html", label: outputLabels[format] }
  if (format === "jsx") return { code: jsx(image, pixelSize, name), extension: "jsx", language: "jsx", label: outputLabels[format] }
  return { code: pixelJSON(image, pixelSize), extension: "json", language: "json", label: outputLabels[format] }
}
