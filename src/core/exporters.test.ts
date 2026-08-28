import { describe, expect, it } from "vitest"
import { generateOutput, outputFormats } from "./exporters"
import type { PixelData } from "./pixel"

const sample: PixelData = {
  width: 2,
  height: 2,
  data: new Uint8ClampedArray([
    255, 0, 0, 255, 255, 0, 0, 255,
    0, 0, 0, 0, 0, 0, 255, 128,
  ]),
}

describe("output formats", () => {
  it("generates every supported format", () => {
    const results = outputFormats.map((format) => generateOutput(format, sample, 3, "my sprite.png"))
    expect(results.every((result) => result.code.length > 0)).toBe(true)
    expect(results.map((result) => result.extension)).toEqual(["html", "html", "html", "jsx", "json"])
  })

  it("groups repeated colors in compact HTML", () => {
    const compact = generateOutput("compact-html", sample, 3, "sample.png").code
    expect(compact.match(/<span/g)).toHaveLength(2)
    expect(compact).toContain("#0000ff80")
    expect(compact).toContain("box-shadow:0 0,3px 0")
  })

  it("reduces code length when a larger image repeats colors", () => {
    const repeated: PixelData = {
      width: 16,
      height: 16,
      data: new Uint8ClampedArray(Array.from({ length: 256 }, () => [18, 52, 86, 255]).flat()),
    }
    const compact = generateOutput("compact-html", repeated, 1, "repeated.png").code
    const single = generateOutput("single-html", repeated, 1, "repeated.png").code
    expect(compact.length).toBeLessThan(single.length)
  })

  it("creates a valid component name for JSX", () => {
    const output = generateOutput("jsx", sample, 2, "my sprite.png").code
    expect(output).toContain("export default function MySprite()")
    expect(output).toContain("boxShadow")
  })

  it("serializes exact layer colors and logical coordinates to JSON", () => {
    const output = JSON.parse(generateOutput("json", sample, 5, "sample.png").code)
    expect(output).toMatchObject({ version: 1, width: 2, height: 2, pixelSize: 5 })
    expect(output.layers).toContainEqual({ color: "#ff0000", pixels: [[0, 0], [1, 0]] })
    expect(output.layers).toContainEqual({ color: "#0000ff80", pixels: [[1, 1]] })
  })
})
