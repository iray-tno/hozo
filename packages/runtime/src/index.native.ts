// The React Native entry point for `@hozo/runtime`.
//
// Metro resolves a platform extension ahead of the plain file, so an app
// importing `@hozo/runtime` gets this on device and `./index.ts` on Web.
// That split is what lets the parts needing `react`/`react-native` be
// exported at all: `./index.ts` is imported by the Web build too, where
// those modules don't exist.
//
// Generated code imports from the package root -- `import { useHozoDark,
// HozoSpaced } from '@hozo/runtime'` -- so everything the compiler can
// emit as a runtime import has to be reachable from here. See
// `hozo_native::LowerOutput::runtime_imports` for that list.

// The `className` prop, for TypeScript only. Imported for its side
// effect: the file declares nothing at runtime and augments React
// Native's prop interfaces so an app can be type-checked against the same
// source the compiler reads. See the file for why it is here rather than
// in `@hozo/core`.
import './class-name.native.ts'

// Re-exported rather than left in `@hozo/behaviors`: generated code should
// depend on one package, not on how the compiler divides its own. The
// implementation stays there, where its tests and its reasoning are.
export {
  Dialog,
  type DialogProps,
  HozoDetails,
  type HozoDetailsProps,
  HozoDialog,
  type HozoDialogProps,
  HozoRuby,
  type HozoRubyProps,
  HozoRubyText,
  type HozoRubyTextProps,
  HozoSummary,
  type HozoSummaryProps,
  hozoTextChildren,
} from '@hozo/behaviors'
export {
  HozoActivityIndicator,
  type HozoActivityIndicatorProps,
} from './activity-indicator.native.ts'
export type { BreakpointName, Viewport } from './ambient.ts'
export { HozoBackdropFilter, type HozoBackdropFilterProps } from './backdrop.native.tsx'
export {
  HozoContainer,
  type HozoContainerProps,
  HozoContainerQuery,
  type HozoContainerWidths,
} from './container.native.tsx'
// `index.ts` names the Web implementation explicitly after TypeScript
// emits it. Override that star export so Metro never sends DOM conversion
// through a native render path.
export { type HozoDomStyle, hozoDomProps, hozoDomStyle } from './dom-style.native.ts'
export { HozoGrid, HozoGridItem } from './grid.native.tsx'
export type { GridTrack } from './grid.ts'
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
export { HozoLink, type HozoLinkProps } from './link.native.tsx'
export {
  HozoPressable,
  type HozoPressableProps,
  type HozoPressableState,
  HozoText,
  type HozoTextProps,
  type HozoTransition,
} from './pressable.native.tsx'
export { type HozoSafeAreaInsets, useHozoSafeArea } from './safe-area.native.ts'
export { HozoSpaced } from './spacing.native.tsx'
export {
  HozoRelativeText,
  type HozoRelativeTextProps,
  HozoTextSize,
  type HozoTextSizeProps,
} from './text-size.native.tsx'
export {
  HozoTouchableOpacity,
  type HozoTouchableOpacityProps,
} from './touchable-opacity.native.ts'
export {
  HozoTouchableWithoutFeedback,
  type HozoTouchableWithoutFeedbackProps,
} from './touchable-without-feedback.native.ts'

export {
  HozoAnimated,
  type HozoAnimatedProps,
  type HozoTransitionSpec,
} from './transition.native.tsx'
