import { encode } from "fast-png"
import { describe, expect, it } from "vitest"
import { decodePNG } from "./image"

describe("PNG decoding", () => {
  it("preserves exact eight-bit RGBA values including partial alpha", async () => {
    const data = new Uint8Array([
      255, 20, 30, 255,
      4, 128, 240, 127,
      0, 0, 0, 0,
      90, 80, 70, 1,
    ])
    const png = encode({ width: 2, height: 2, data, depth: 8, channels: 4 })
    const decoded = await decodePNG(new Blob([png], { type: "image/png" }))
    expect([...decoded.data]).toEqual([...data])
  })

  it("rejects sixteen-bit PNG instead of silently changing its colors", async () => {
    const png = encode({ width: 1, height: 1, data: new Uint16Array([65535, 30000, 0, 65535]), depth: 16, channels: 4 })
    await expect(decodePNG(new Blob([png], { type: "image/png" }))).rejects.toThrow("16비트 PNG")
  })
})
