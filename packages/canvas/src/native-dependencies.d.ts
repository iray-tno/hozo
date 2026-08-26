// @shopify/react-native-skia is an optional peer: Web consumers should not
// install a multi-megabyte renderer they never load. Keeping the small surface
// used by our adapter here lets the package type-check without making that
// optional peer a development-time hard dependency.
declare module '@shopify/react-native-skia' {
  import type { ComponentType } from 'react'

  export const Canvas: ComponentType<Record<string, unknown>>
  export const Group: ComponentType<Record<string, unknown>>
  export const Rect: ComponentType<Record<string, unknown>>
  export const RoundedRect: ComponentType<Record<string, unknown>>
  export const Circle: ComponentType<Record<string, unknown>>
  export const Oval: ComponentType<Record<string, unknown>>
  export const Line: ComponentType<Record<string, unknown>>
  export const Path: ComponentType<Record<string, unknown>>
}
