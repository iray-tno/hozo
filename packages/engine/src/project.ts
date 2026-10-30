import { createClassResolver } from './class-resolver.ts'
import type { ClassTransitionTable } from './class-transition.ts'

/**
 * Project-wide Native defaults when no bundler integration supplies them.
 *
 * `@hozo/metro` redirects this entry to the generated candidate module,
 * whose value is the resolved `preflight` option. Keeping a real entry here
 * makes unconfigured builds and component tests deterministic; Tailwind's
 * reset is the common case and was the fallback before this entry existed.
 */
export const hozoPreflight = true

/**
 * The project's class resolver, for code the compiler does not lower --
 * `@hozo/patterns`' Native components resolve their class props through it
 * (#886). Redirected to the generated candidate module like `hozoPreflight`;
 * unconfigured, there is no candidate map, so it resolves nothing, which is
 * what those props did before.
 */
export const hozoClasses = createClassResolver({})

/**
 * What the project's runtime-resolved classes say about transitions (#1450),
 * for the same components, read through `createClassTransitions`.
 * Redirected like `hozoClasses`; unconfigured, it is empty, so those
 * components keep switching at once.
 */
export const hozoClassTransitions: ClassTransitionTable = {}
