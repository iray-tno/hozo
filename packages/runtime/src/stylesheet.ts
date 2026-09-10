export type HozoNamedStyles<T> = { [Name in keyof T]: Readonly<Record<string, unknown>> }

export type HozoStyle =
  | Readonly<Record<string, unknown>>
  | readonly HozoStyle[]
  | false
  | null
  | undefined

const absoluteFillObject = Object.freeze({
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
})

function flattenInto(style: HozoStyle, result: Record<string, unknown>) {
  if (style == null || style === false) return
  if (Array.isArray(style)) {
    for (const part of style) flattenInto(part, result)
    return
  }
  if (typeof style === 'object') Object.assign(result, style)
}

/** The object-style subset shared by React Native and React Native Web. */
export const StyleSheet = Object.freeze({
  absoluteFill: absoluteFillObject,
  absoluteFillObject,
  hairlineWidth: 1,

  create<T extends HozoNamedStyles<T>>(styles: T): T {
    if (process.env.NODE_ENV !== 'production') {
      for (const style of Object.values(styles)) Object.freeze(style)
    }
    return styles
  },

  compose<First extends HozoStyle, Second extends HozoStyle>(first: First, second: Second) {
    return [first, second] as const
  },

  flatten(...styles: HozoStyle[]): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    flattenInto(styles, result)
    return result
  },
})
