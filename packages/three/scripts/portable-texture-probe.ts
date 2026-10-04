import { type CanvasScene, type CanvasTextureWrap, renderCanvas2D } from '@hozo/canvas'
import { Color } from 'three'

export interface PortableTextureResult {
  name: string
  passed: boolean
  samples: number
  maxChannelError: number
}

/** Actual pixels, including negative UVs: command mocks cannot prove tile parity. */
export function probePortableTextures(): PortableTextureResult[] {
  const colors = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 255, 255],
  ]
  const target = document.createElement('canvas')
  target.width = target.height = 128
  const context = target.getContext('2d', { willReadFrequently: true })!
  const results: PortableTextureResult[] = []
  const wraps: CanvasTextureWrap[] = ['clamp', 'repeat', 'mirror']
  const variants = [
    { name: 'identity', tint: { r: 1, g: 1, b: 1 }, intensity: 1, colors, tolerance: 0 },
    ...[
      { name: 'tint', tint: { r: 0.5, g: 0.25, b: 2 }, intensity: 1 },
      { name: 'intensity', tint: { r: 1, g: 1, b: 1 }, intensity: 0.5 },
      { name: 'black', tint: { r: 0, g: 0, b: 0 }, intensity: 2 },
    ].map((variant) => ({
      ...variant,
      colors: [
        [255, 128, 64, 128],
        [64, 192, 255, 255],
        [32, 96, 160, 128],
        [0, 0, 0, 0],
      ],
      tolerance: 2,
    })),
  ]
  for (const variant of variants) {
    const source = document.createElement('canvas')
    source.width = source.height = 2
    source
      .getContext('2d')!
      .putImageData(new ImageData(new Uint8ClampedArray(variant.colors.flat()), 2, 2), 0, 0)
    for (const wrapX of wraps) {
      for (const wrapY of wraps) {
        const startX = wrapX === 'clamp' ? 0 : -1
        const startY = wrapY === 'clamp' ? 0 : -1
        const spanX = wrapX === 'clamp' ? 1 : 4
        const spanY = wrapY === 'clamp' ? 1 : 4
        const scene: CanvasScene = [
          {
            kind: 'triangle-mesh',
            props: {
              vertices: [
                { x: 0, y: 0 },
                { x: 128, y: 0 },
                { x: 0, y: 128 },
                { x: 128, y: 128 },
              ],
              indices: [0, 1, 2, 1, 3, 2],
              texture: {
                source: '/decoded.png',
                wrapX,
                wrapY,
                filter: 'nearest',
                tint: variant.tint,
                intensity: variant.intensity,
                coordinates: [
                  { x: startX, y: startY },
                  { x: startX + spanX, y: startY },
                  { x: startX, y: startY + spanY },
                  { x: startX + spanX, y: startY + spanY },
                ],
              },
            },
          },
        ]
        renderCanvas2D(context, scene, { width: 128, height: 128, pixelRatio: 1 }, () => source)
        const pixels = context.getImageData(0, 0, 128, 128).data
        let maxChannelError = 0
        let samples = 0
        const coordinate = (value: number, wrap: CanvasTextureWrap) => {
          if (wrap === 'clamp') return Math.min(1, Math.max(0, value))
          const tile = Math.floor(value)
          const within = value - tile
          return wrap === 'mirror' && Math.abs(tile % 2) === 1 ? 1 - within : within
        }
        // Centers of half-tiles avoid triangle edges and sampling boundaries.
        for (let y = 4; y < 128; y += 8) {
          for (let x = 4; x < 128; x += 8) {
            if (x + y === 127 || x + y === 128) continue
            const u = coordinate(startX + ((x + 0.5) / 128) * spanX, wrapX)
            const v = coordinate(startY + ((y + 0.5) / 128) * spanY, wrapY)
            const input =
              variant.colors[Math.min(1, Math.floor(v * 2)) * 2 + Math.min(1, Math.floor(u * 2))]!
            const expectedColor = new Color(input[0]! / 255, input[1]! / 255, input[2]! / 255)
              .convertSRGBToLinear()
              .multiply(new Color(variant.tint.r, variant.tint.g, variant.tint.b))
              .multiplyScalar(variant.intensity)
              .convertLinearToSRGB()
            const expected = [expectedColor.r, expectedColor.g, expectedColor.b].map((channel) =>
              Math.round(Math.max(0, Math.min(1, channel)) * 255),
            )
            expected.push(input[3]!)
            const offset = (y * 128 + x) * 4
            for (let channel = 0; channel < 4; channel += 1) {
              maxChannelError = Math.max(
                maxChannelError,
                Math.abs(pixels[offset + channel]! - expected[channel]!),
              )
            }
            samples += 1
          }
        }
        results.push({
          name: `${variant.name}: ${wrapX}/${wrapY}`,
          passed: maxChannelError <= variant.tolerance,
          samples,
          maxChannelError,
        })
      }
    }
  }
  return results
}
