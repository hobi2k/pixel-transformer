import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import type { OutputFormat } from "./exporters"

export type BatchEntry = {
  name: string
  extension: string
  code: string
}

function baseName(name: string) {
  return name.replace(/\.png$/i, "").replace(/[^\p{L}\p{N}._-]+/gu, "-") || "pixel-art"
}

export function createBatchArchive(entries: BatchEntry[], format: OutputFormat, generatedAt = new Date()) {
  const usedNames = new Map<string, number>()
  const files = Object.fromEntries(entries.map((entry) => {
    const base = baseName(entry.name)
    const count = usedNames.get(base) ?? 0
    usedNames.set(base, count + 1)
    const suffix = count ? `-${count + 1}` : ""
    return [`${base}${suffix}-box-shadow.${entry.extension}`, strToU8(entry.code)]
  }))
  files["manifest.json"] = strToU8(JSON.stringify({ format, count: entries.length, generatedAt: generatedAt.toISOString() }, null, 2))
  return zipSync(files, { level: 6 })
}

export function inspectBatchArchive(archive: Uint8Array) {
  return Object.fromEntries(Object.entries(unzipSync(archive)).map(([name, data]) => [name, strFromU8(data)]))
}
