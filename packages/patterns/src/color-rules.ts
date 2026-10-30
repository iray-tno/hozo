/**
 * The arithmetic of a colour picker, and the words a reader is given for a
 * colour.
 *
 * The picker edits hue, saturation and lightness, and keeps them as its own
 * state rather than recomputing them from the hex each time: a hex has no
 * hue once saturation is 0, so a picker that re-derived it would throw away
 * the hue the moment someone dragged saturation to grey.
 */

export interface Hsla {
  /** 0–360. */
  h: number
  /** 0–100. */
  s: number
  /** 0–100. */
  l: number
  /** 0–1. */
  a: number
}

const clamp = (value: number, lowest: number, highest: number) =>
  Math.min(Math.max(value, lowest), highest)

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`, any case, `#` optional; `null` otherwise. */
export function parseHex(text: string): { r: number; g: number; b: number; a: number } | null {
  const hex = text.trim().replace(/^#/, '')
  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null
  const full = hex.length <= 4 ? Array.from(hex, (c) => c + c).join('') : hex
  const channel = (at: number) => Number.parseInt(full.slice(at, at + 2), 16)
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: full.length === 8 ? channel(6) / 255 : 1,
  }
}

export function hexToHsla(text: string): Hsla | null {
  const rgb = parseHex(text)
  if (!rgb) return null
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: s * 100, l: l * 100, a: rgb.a }
}

/** Lower-case `#rrggbb`, or `#rrggbbaa` when not opaque. */
export function hslaToHex({ h, s, l, a }: Hsla): string {
  const sat = clamp(s, 0, 100) / 100
  const light = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const hue = ((h % 360) + 360) % 360
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  const byte = (value: number) =>
    Math.round(clamp(value + m, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0')
  const alpha = clamp(a, 0, 1)
  return `#${byte(r)}${byte(g)}${byte(b)}${
    alpha < 1
      ? Math.round(alpha * 255)
          .toString(16)
          .padStart(2, '0')
      : ''
  }`
}

/** A colour's coarse name: a hue word and how light it is, or a grey. */
export interface ColorName {
  /** `red`, `orange`, …, or `gray` / `black` / `white`. */
  hue:
    | 'red'
    | 'orange'
    | 'yellow'
    | 'green'
    | 'cyan'
    | 'blue'
    | 'purple'
    | 'pink'
    | 'gray'
    | 'black'
    | 'white'
  /** `dark` below 35% lightness, `light` above 78%. */
  shade?: 'dark' | 'light'
}

/**
 * The words for a colour, coarse on purpose. A reader is told "dark blue,
 * #1e3a8a", never only the hex -- six hexadecimal digits read aloud say
 * nothing -- and never only the name, which is too rough to tell two blues
 * apart. The buckets are the eleven basic colour terms most languages share,
 * minus brown, which is a dark orange to the eye and reads as one here.
 */
export function colorName({ h, s, l }: Hsla): ColorName {
  if (l <= 8) return { hue: 'black' }
  if (l >= 94) return { hue: 'white' }
  // HSL lightness runs above what an eye sees -- #1e3a8a is 33% and plainly
  // dark blue -- so "dark" starts higher than a quarter.
  const shade = l < 35 ? 'dark' : l > 78 ? 'light' : undefined
  if (s < 12) return shade ? { hue: 'gray', shade } : { hue: 'gray' }
  const hue = ((h % 360) + 360) % 360
  const word: ColorName['hue'] =
    hue < 15 || hue >= 345
      ? 'red'
      : hue < 45
        ? 'orange'
        : hue < 70
          ? 'yellow'
          : hue < 165
            ? 'green'
            : hue < 195
              ? 'cyan'
              : hue < 255
                ? 'blue'
                : hue < 290
                  ? 'purple'
                  : 'pink'
  return shade ? { hue: word, shade } : { hue: word }
}

/**
 * What each slider's track shows: the colours its value moves through.
 *
 * CSS gradient strings, shared by both halves. The Web paints them as
 * `background`. React Native 0.86 parses the same syntax as
 * `experimental_backgroundImage`, which the Native half paints. Without a
 * track the Native sliders were invisible: no fill, and a white thumb on a
 * white surface (#1205).
 *
 * The alpha track ends in the colour at zero alpha rather than
 * `transparent`, which is black at zero alpha and would draw the ramp
 * through grey anywhere a renderer does not premultiply.
 */
export function colorTracks(hsla: Hsla): {
  hue: string
  saturation: string
  lightness: string
  alpha: string
} {
  return {
    hue: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
    saturation: `linear-gradient(to right, ${hslaToHex({ ...hsla, s: 0, a: 1 })}, ${hslaToHex({ ...hsla, s: 100, a: 1 })})`,
    lightness: `linear-gradient(to right, #000000, ${hslaToHex({ ...hsla, l: 50, a: 1 })}, #ffffff)`,
    alpha: `linear-gradient(to right, ${hslaToHex({ ...hsla, a: 0 })}, ${hslaToHex({ ...hsla, a: 1 })})`,
  }
}

/** Sample the same RGB stops as the tracks, at the sliders' rounded values. */
export function colorThumbs(hsla: Hsla) {
  const mix = (stops: string[], fraction: number) => {
    const at = clamp(fraction, 0, 1) * (stops.length - 1)
    const index = Math.min(Math.floor(at), stops.length - 2)
    const from = parseHex(stops[index]!)!
    const to = parseHex(stops[index + 1]!)!
    return `#${(['r', 'g', 'b'] as const)
      .map((channel) =>
        Math.round(from[channel] + (to[channel] - from[channel]) * (at - index))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`
  }
  return {
    hue: mix(
      ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'],
      Math.round(hsla.h) / 359,
    ),
    saturation: mix(
      [hslaToHex({ ...hsla, s: 0, a: 1 }), hslaToHex({ ...hsla, s: 100, a: 1 })],
      Math.round(hsla.s) / 100,
    ),
    lightness: mix(
      ['#000000', hslaToHex({ ...hsla, l: 50, a: 1 }), '#ffffff'],
      Math.round(hsla.l) / 100,
    ),
    alpha: hslaToHex({ ...hsla, a: Math.round(hsla.a * 100) / 100 }),
  }
}
