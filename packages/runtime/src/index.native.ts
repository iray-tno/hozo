// The React Native entry point for `@hozo/runtime`.
//
// Metro resolves a platform extension ahead of the plain file, so an app
// importing `@hozo/runtime` gets this on device and `./index.ts` on Web.
// That split is what lets the parts needing `react`/`react-native` be
// exported at all: `./index.ts` is imported by the Web build too, where
// those modules don't exist.
//
// Generated infrastructure such as `useHozoDark` remains reachable here,
// but compiled output imports it leaf by leaf from `./generated/*` (through
// `@hozo/core/generated/*`). Compiler-generated React components are owned
// by domain packages, including `@hozo/primitives/generated/*` for Native
// layout boundaries.

// The `className` prop, for TypeScript only. Imported for its side
// effect: the file declares nothing at runtime and augments React
// Native's prop interfaces so an app can be type-checked against the same
// source the compiler reads. See the file for why it is here rather than
// in `@hozo/core`.
import './class-name.native.ts'

export type { BreakpointName, Viewport } from './ambient.ts'
// `index.ts` names the Web implementation explicitly after TypeScript
// emits it. Override that star export so Metro never sends DOM conversion
// through a native render path.
export { type HozoDomStyle, hozoDomProps, hozoDomStyle } from './dom-style.native.ts'
export {
  type HozoAnimation,
  useHozoAnimation,
  useHozoBreakpoint,
  useHozoDark,
  useHozoEnvironment,
  useHozoViewport,
  useHozoWidthAtLeast,
} from './hooks.native.ts'
export { hozoImageSource } from './image-source.native.ts'
export * from './index.ts'
export { type HozoSafeAreaInsets, useHozoSafeArea } from './safe-area.native.ts'
