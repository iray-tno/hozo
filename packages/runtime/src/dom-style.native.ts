import type { HozoDomStyle } from './dom-style.ts'

export type { HozoDomStyle } from './dom-style.ts'

/** React Native already owns StyleProp flattening and value semantics. */
export function hozoDomStyle(input: HozoDomStyle): HozoDomStyle {
  return input
}

/** React Native props need no DOM normalization. */
export function hozoDomProps<T>(props: T): T {
  return props
}
