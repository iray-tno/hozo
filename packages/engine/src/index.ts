// The only thing Hozo ships to a device, and it exists for exactly one
// reason: React Native has no CSS engine.
//
// On Web, a `className` the compiler couldn't read needs no runtime at all
// -- the class string reaches the DOM, and the browser matches it against
// the generated candidate stylesheet by itself. Native has nothing to hand
// the string to, so this closes that one gap and nothing else.
//
// One exception, added later: a `<div role="button">` that Hozo put in the
// tab order needs Enter and Space wired up, and only script can do that.
// See `./activate.ts`.
//
// Compare `react-native-css`, which implements a genuine CSS engine in JS:
// specificity sorting, media/container query evaluation, CSS variables, a
// reactive observable graph. It needs all of that because it accepts
// arbitrary CSS. This resolver handles only *single Tailwind utility
// classes*, which are all the same specificity -- so "later in the string
// wins" is the entire cascade, and React Native's own style-array merging
// already implements that. Hence a lookup, not an engine.

export { hozoActivateKeyDown, hozoActivateKeyUp } from './activate.ts'
export {
  configureHozoBackdropFilter,
  createExpoBlurAdapter,
  type ExpoBlurAdapterOptions,
  type HozoBackdropFilterAdapter,
  type HozoBackdropFilterAdapterProps,
  hozoBackdropFilterAdapter,
} from './backdrop.ts'

export { type ClassResolver, createClassResolver, type StyleObject } from './class-resolver.ts'
export { blendColor } from './color-transition.ts'
export { type HozoDomStyle, hozoDomProps, hozoDomStyle } from './dom-style.ts'
export { externalLinkAttributes } from './external-link.ts'
export { hozoInteractive } from './interactive.ts'
export {
  type HozoResponderEvent,
  type HozoResponderTouch,
  type HozoTouchHistory,
  type HozoTouchTrack,
  type ResponderProps,
  useResponderDomProps,
} from './responder.ts'
export { hozoScrollable } from './scrollable.ts'

export {
  HOZO_DEFAULT_FONT_SIZE,
  HozoTextSizeContext,
  useHozoTextSize,
} from './text-size.ts'
