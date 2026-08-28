import { describe, expect, it } from "vitest"
import {
  analyzeImageData,
  buildPalette,
  collapseImageData,
  colorHex,
  detectExactBlockScale,
  verifyLossless,
  type PixelData,
} from "./pixel"

function image(width: number, height: number, pixels: number[][]): PixelData {
  return { width, height, data: new Uint8ClampedArray(pixels.flat()) }
}

function upscale(source: PixelData, factor: number): PixelData {
  const width = source.width * factor
  const height = source.height * factor
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (Math.floor(y / factor) * source.width + Math.floor(x / factor)) * 4
      data.set(source.data.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4)
    }
  }
  return { width, height, data }
}

describe("lossless pixel analysis", () => {
  const logical = image(2, 2, [
    [255, 0, 0, 255], [0, 255, 0, 128],
    [0, 0, 0, 0], [0, 0, 255, 255],
  ])

  it("detects and collapses an exact integer upscale", () => {
    const source = upscale(logical, 3)
    expect(detectExactBlockScale(source)).toBe(3)
    const collapsed = collapseImageData(source, 3)
    expect(collapsed.width).toBe(2)
    expect(collapsed.height).toBe(2)
    expect([...collapsed.data]).toEqual([...logical.data])
    expect(verifyLossless(source, collapsed, 3)).toBe(0)
  })

  it("falls back to one pixel when a block contains a mismatch", () => {
    const source = upscale(logical, 3)
    source.data[(2 * source.width + 2) * 4] = 17
    expect(detectExactBlockScale(source)).toBe(1)
  })

  it("preserves eight-bit alpha as hexadecimal", () => {
    expect(colorHex(logical.data, 0)).toBe("#ff0000")
    expect(colorHex(logical.data, 4)).toBe("#00ff0080")
  })

  it("excludes fully transparent pixels but keeps partial alpha", () => {
    expect(analyzeImageData(logical)).toMatchObject({ colors: 3, visible: 3, translucent: 1 })
    const layers = buildPalette(logical, 4)
    expect(layers).toHaveLength(3)
    expect(layers.find((layer) => layer.color === "#00ff0080")?.coordinates).toEqual(["4px 0"])
  })

  it("collapses a fully transparent canvas without adding visible pixels", () => {
    const transparent = image(4, 4, Array.from({ length: 16 }, () => [0, 0, 0, 0]))
    const factor = detectExactBlockScale(transparent)
    const collapsed = collapseImageData(transparent, factor)
    expect(factor).toBe(4)
    expect(analyzeImageData(collapsed).visible).toBe(0)
    expect(verifyLossless(transparent, collapsed, factor)).toBe(0)
  })
})
