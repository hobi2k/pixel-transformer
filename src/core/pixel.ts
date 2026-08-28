export type PixelData = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type PixelAnalysis = {
  colors: number
  visible: number
  translucent: number
  detectedScale: number
}

export type PixelLayer = {
  color: string
  coordinates: string[]
}

function rgbaEqual(data: Uint8ClampedArray, first: number, second: number) {
  return (
    data[first] === data[second] &&
    data[first + 1] === data[second + 1] &&
    data[first + 2] === data[second + 2] &&
    data[first + 3] === data[second + 3]
  )
}

function gcd(a: number, b: number) {
  let left = Math.abs(a)
  let right = Math.abs(b)
  while (right) [left, right] = [right, left % right]
  return left
}

export function colorHex(data: Uint8ClampedArray, offset: number) {
  const value = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
  return data[offset + 3] === 255 ? `#${value.slice(0, 6)}` : `#${value}`
}

export function detectExactBlockScale(image: PixelData) {
  let factor = gcd(image.width, image.height)

  for (let y = 0; y < image.height && factor > 1; y += 1) {
    const row = y * image.width
    for (let x = 1; x < image.width && factor > 1; x += 1) {
      if (!rgbaEqual(image.data, (row + x - 1) * 4, (row + x) * 4)) factor = gcd(factor, x)
    }
  }

  for (let x = 0; x < image.width && factor > 1; x += 1) {
    for (let y = 1; y < image.height && factor > 1; y += 1) {
      if (!rgbaEqual(image.data, ((y - 1) * image.width + x) * 4, (y * image.width + x) * 4)) {
        factor = gcd(factor, y)
      }
    }
  }

  if (factor <= 1) return 1
  for (let y = 0; y < image.height; y += 1) {
    const sampleY = y - (y % factor)
    for (let x = 0; x < image.width; x += 1) {
      const sampleX = x - (x % factor)
      if (!rgbaEqual(image.data, (y * image.width + x) * 4, (sampleY * image.width + sampleX) * 4)) return 1
    }
  }
  return factor
}

export function collapseImageData(image: PixelData, factor: number): PixelData {
  if (!Number.isInteger(factor) || factor < 1 || image.width % factor || image.height % factor) {
    throw new Error("Invalid lossless scale factor")
  }
  const width = image.width / factor
  const height = image.height / factor
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = ((y * factor) * image.width + x * factor) * 4
      const target = (y * width + x) * 4
      data.set(image.data.subarray(source, source + 4), target)
    }
  }
  return { width, height, data }
}

export function analyzeImageData(image: PixelData): PixelAnalysis {
  const colors = new Set<string>()
  let visible = 0
  let translucent = 0

  for (let index = 0; index < image.data.length; index += 4) {
    const alpha = image.data[index + 3]
    if (alpha === 0) continue
    colors.add(colorHex(image.data, index))
    visible += 1
    if (alpha < 255) translucent += 1
  }

  return {
    colors: colors.size,
    visible,
    translucent,
    detectedScale: detectExactBlockScale(image),
  }
}

export function buildPalette(image: PixelData, pixelSize: number): PixelLayer[] {
  const palette = new Map<string, string[]>()

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      if (image.data[offset + 3] === 0) continue
      const color = colorHex(image.data, offset)
      const coordinates = palette.get(color) ?? []
      coordinates.push(`${x ? `${x * pixelSize}px` : 0} ${y ? `${y * pixelSize}px` : 0}`)
      palette.set(color, coordinates)
    }
  }

  return [...palette].map(([color, coordinates]) => ({ color, coordinates }))
}

export function verifyLossless(source: PixelData, logical: PixelData, factor: number) {
  let mismatch = 0
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceOffset = (y * source.width + x) * 4
      const logicalOffset = (Math.floor(y / factor) * logical.width + Math.floor(x / factor)) * 4
      if (!rgbaEqualPair(source.data, sourceOffset, logical.data, logicalOffset)) mismatch += 1
    }
  }
  return mismatch
}

function rgbaEqualPair(first: Uint8ClampedArray, firstOffset: number, second: Uint8ClampedArray, secondOffset: number) {
  return (
    first[firstOffset] === second[secondOffset] &&
    first[firstOffset + 1] === second[secondOffset + 1] &&
    first[firstOffset + 2] === second[secondOffset + 2] &&
    first[firstOffset + 3] === second[secondOffset + 3]
  )
}
