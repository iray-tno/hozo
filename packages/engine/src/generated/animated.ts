// Native-only, like the layout boundaries: the Web backend animates with CSS
// and never asks for it. In the engine rather than `@hozo/primitives`
// because `@hozo/patterns` runs it too, for a look resolved at run time
// (#1450), and patterns are built on the engine, not on primitives.

export {
  PresenceContext,
  type PresenceContextValue,
  type PresenceState,
} from '../presence-context.ts'
export {
  HozoAnimated,
  type HozoAnimatedProps,
  type HozoTransitionSpec,
} from '../runtime-transition.native.tsx'
