// The React glue for `./spacing.ts`. Thin on purpose -- everything worth
// testing is there, free of `react` imports; this file is the part that can
// only be verified by running an app, same division as `./hooks.native.ts`.
//
// Generated components render this; nothing here is meant to be written by
// hand.

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

import { spacingTargets } from './spacing.ts'

interface Props {
  /**
   * The style each spaced child receives -- a `StyleSheet` entry the
   * compiler generated from the parent's `space-*`/`divide-*` utilities.
   */
  style: unknown
  children?: ReactNode
}

/**
 * Applies a parent's `space-*`/`divide-*` to its children.
 *
 * Renders no host view: it returns its children rather than an element, so
 * Yoga sees exactly the same tree it would without this in it, and the
 * parent's flex layout is unchanged.
 *
 * The style is merged *behind* each child's own, matching the `:where()`
 * wrapper the Web rule uses to hold specificity at zero -- a child's own
 * `mt-8` beats the parent's `space-y-4` on both backends.
 *
 * Compile-time resolution isn't possible in general and that is why this
 * exists: `{items.map(...)}` is one child as far as the compiler can see
 * and any number of them at runtime, so the count that decides which child
 * is last is only known here.
 */
/**
 * The parent spacing behind a child's own style, in whatever shape the
 * child's style has.
 *
 * A Pressable's style can be a *callback*, and the compiler emits one for
 * any element with a state variant -- `hover:`, `focus-visible:`,
 * `active:`. Putting a function in an array does not compose it with
 * anything: React Native flattens the array, finds a function where a
 * style object belongs, and skips it. The child then renders with the
 * spacing and nothing else -- no background, no padding, no radius.
 *
 * That is what made the acceptance screen's Continue button invisible
 * (#357), and it was not the button. Six probes on a screen whose
 * container uses `gap-*` all drew, including one copied prop for prop;
 * the difference was the `space-y-4` on the container.
 *
 * So a callback stays a callback, with the spacing behind whatever it
 * returns for the state it is called with.
 */
function spaced(parent: unknown, own: unknown): unknown {
  if (typeof own !== 'function') return [parent, own]
  const resolve = own as (state: unknown) => unknown
  return (state: unknown) => [parent, resolve(state)]
}

export function HozoSpaced({ style, children }: Props): ReactNode {
  // `toArray` flattens nested arrays and drops null/undefined/booleans, so
  // a conditional child that renders nothing doesn't take the last slot and
  // silently swallow the spacing -- the same way an unrendered element
  // wouldn't be `:last-child` on Web.
  const list = Children.toArray(children)
  const targets = new Set(spacingTargets(list, isValidElement))

  return list.map((child, index) => {
    if (!targets.has(index)) return child
    const element = child as ReactElement<{ style?: unknown }>
    return cloneElement(element, { style: spaced(style, element.props.style) })
  })
}
