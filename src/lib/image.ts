import { convertIndexedToRgb, decode } from "fast-png"
import type { PixelData } from "../core/pixel"

export async function decodePNG(file: File | Blob): Promise<PixelData> {
  const decoded = decode(new Uint8Array(await file.arrayBuffer()), { checkCrc: true })
  if (!decoded.palette && decoded.depth !== 8) throw new Error("16비트 PNG는 RGBA를 정확히 보존할 수 없습니다.")

  const source = decoded.palette ? convertIndexedToRgb(decoded) : decoded.data
  const channels = decoded.palette?.[0]?.length ?? decoded.channels
  const data = new Uint8ClampedArray(decoded.width * decoded.height * 4)

  for (let pixel = 0; pixel < decoded.width * decoded.height; pixel += 1) {
    const input = pixel * channels
    const output = pixel * 4
    if (channels === 4) {
      data.set(source.subarray(input, input + 4), output)
      continue
    }
    if (channels === 3) {
      data.set(source.subarray(input, input + 3), output)
      data[output + 3] = decoded.transparency &&
        source[input] === decoded.transparency[0] &&
        source[input + 1] === decoded.transparency[1] &&
        source[input + 2] === decoded.transparency[2] ? 0 : 255
      continue
    }
    data[output] = source[input]
    data[output + 1] = source[input]
    data[output + 2] = source[input]
    data[output + 3] = channels === 2
      ? source[input + 1]
      : decoded.transparency?.[0] === source[input] ? 0 : 255
  }

  return { width: decoded.width, height: decoded.height, data }
}

export function isPNG(file: File) {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png")
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function downloadBlob(blob: Blob, name: string) {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
