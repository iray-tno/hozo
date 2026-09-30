import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'

type RGB = readonly [number, number, number]
const blend = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

function texture(width: number, height: number, pixel: (x: number, y: number) => RGB) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const color = pixel(x, y)
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel++)
        data[offset + channel] = Math.max(0, Math.min(255, Math.round(color[channel])))
      data[offset + 3] = 255
    }
  const result = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  result.colorSpace = SRGBColorSpace
  result.flipY = true
  result.generateMipmaps = true
  result.minFilter = LinearMipmapLinearFilter
  result.magFilter = LinearFilter
  result.needsUpdate = true
  return result
}

/** Deterministic RGBA pixels: no DOM, Image, asset loading, or host canvas. */
export function createTimberTextures() {
  const woodTexture = texture(512, 128, (x, y) => {
    const t = y / 127
    const wash =
      t < 0.48
        ? blend([194, 138, 76], [227, 186, 118], t / 0.48)
        : blend([227, 186, 118], [169, 111, 55], (t - 0.48) / 0.52)
    const warped = y + Math.sin(x * 0.025 + y * 0.07) * 2.3 + Math.sin(x * 0.009) * 1.5
    const grain = Math.max(0, Math.cos(warped * 2.8)) ** 12 * 0.12
    return blend(wash, [75, 39, 14], grain)
  })
  woodTexture.wrapS = woodTexture.wrapT = RepeatWrapping
  woodTexture.repeat.set(1.8, 1)
  const endGrainTexture = texture(256, 256, (x, y) => {
    const dx = x - 126,
      dy = y - 132
    const radius = Math.hypot(dx, dy)
    const t = Math.max(0, Math.min(1, (radius - 12) / 166))
    const wash =
      t < 0.58
        ? blend([232, 201, 142], [215, 169, 102], t / 0.58)
        : blend([215, 169, 102], [187, 125, 63], (t - 0.58) / 0.42)
    const angle = Math.atan2(dy, dx)
    const elliptical = Math.hypot(dx, dy * 1.35) + Math.sin(angle * 3) * 2
    const ring = Math.max(0, Math.cos(elliptical * 0.7)) ** 18 * 0.12
    const ray = radius > 15 ? Math.max(0, Math.cos(angle * 7)) ** 80 * 0.05 : 0
    return blend(wash, [94, 49, 18], ring + ray)
  })
  return { woodTexture, endGrainTexture }
}
