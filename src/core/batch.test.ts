import { describe, expect, it } from "vitest"
import { createBatchArchive, inspectBatchArchive } from "./batch"

describe("batch archive", () => {
  it("stores every output and a manifest", () => {
    const archive = createBatchArchive(
      [
        { name: "hamster.png", extension: "jsx", code: "export default function A() {}" },
        { name: "star.png", extension: "jsx", code: "export default function B() {}" },
      ],
      "jsx",
      new Date("2026-08-28T00:00:00.000Z"),
    )
    const files = inspectBatchArchive(archive)
    expect(files["hamster-box-shadow.jsx"]).toContain("function A")
    expect(files["star-box-shadow.jsx"]).toContain("function B")
    expect(JSON.parse(files["manifest.json"])).toEqual({
      format: "jsx",
      count: 2,
      generatedAt: "2026-08-28T00:00:00.000Z",
    })
  })

  it("keeps duplicate input names instead of overwriting them", () => {
    const files = inspectBatchArchive(createBatchArchive([
      { name: "same.png", extension: "html", code: "first" },
      { name: "same.png", extension: "html", code: "second" },
    ], "compact-html"))
    expect(files["same-box-shadow.html"]).toBe("first")
    expect(files["same-2-box-shadow.html"]).toBe("second")
  })
})
