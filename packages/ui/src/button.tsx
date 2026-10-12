/**
 * A button with a look, wrapping the `Button` primitive and adding nothing.
 *
 * No role, no keyboard contract, no state machine -- all of that is the
 * primitive's, verified where it lives. This file picks class names. That is
 * the constraint the whole package rests on (#638 §2): a styled layer that
 * implements behaviour becomes a second implementation of the same widget, and
 * then the one people use is not the one the Verification Matrix covers.
 *
 * `href` passes through, because the primitive already becomes a `Link` when
 * given one. A styled button that silently turned into an unstyled anchor
 * would be exactly the kind of gap this package exists to close.
 *
 * ## Why the class lists are written out, inside `clsx`
 *
 * Every tone is a complete literal in its own element, rather than pieces
 * joined at runtime. Two different tools need to see them and neither runs the
 * code: Tailwind's scanner has to find the class names to emit their CSS, and
 * Hozo's compiler compiles a `className` it can read statically and falls back
 * to the project-wide candidate sheet for one it cannot. A library whose own
 * classes take the fallback path would be arguing against itself.
 *
 * And on React Native the fallback cannot carry a state at all: `hover:`,
 * `active:`, `disabled:` and `focus-visible:` are refused there with a runtime
 * warning, because a style object has no way to hold them. These were written
 * as `` `${own} ${className}` ``, which the compiler cannot read, so on device
 * this button had no pressed, hovered, focused or disabled look.
 *
 * `clsx` is what lets the caller's `className` join without taking the rest
 * down with it: the compiler decomposes a `clsx` call argument by argument, so
 * the literal compiles and only `className` falls back. A literal carrying a
 * variant also falls back once it sits under a ternary or `&&`, which is why
 * the tone picks an element rather than a string. The size carries no variant,
 * so it can.
 *
 * `disabled` is passed by name rather than inside `rest`. The compiler wires
 * `disabled:` on Native to the prop it can see on the element, and a spread
 * hides it.
 *
 * It is repetitive on purpose. The alternative -- `[base, tones[tone]].join()`
 * -- reads better and is invisible to both tools.
 */

import { Button as ButtonPrimitive, type ButtonProps } from '@hozo/primitives'
import clsx from 'clsx'

/** How loud the button is. Finite and closed, so a compiler can enumerate it. */
export type HozoButtonTone = 'accent' | 'neutral' | 'quiet' | 'danger'

export type HozoButtonSize = 'sm' | 'md'

export interface HozoButtonProps extends ButtonProps {
  tone?: HozoButtonTone
  size?: HozoButtonSize
}

/**
 * The focus ring lives in every one of these, and that is the point.
 *
 * The demo this package's look was taken from had
 * `focus-visible:outline-indigo-600` in four places and nothing at all in most
 * of the rest. A ring that is part of the only class list a button can have is
 * a ring that cannot be forgotten.
 *
 * `active:opacity-80` is the pressed look, the same on every tone. On a touch
 * screen there is no hover, so without it a tap changes nothing until whatever
 * it started finishes. It is opacity rather than a colour per tone because a
 * press lasts a moment and needs to be seen, not matched to a palette; and
 * `transition-colors` leaves opacity out, so it shows at once.
 *
 * `disabled:cursor-auto` rather than `cursor-not-allowed`: React Native's
 * `cursor` takes only `auto` and `pointer`, and now that these classes compile
 * for Native too, `not-allowed` there is a build error rather than a fallback.
 *
 * `disabled:` rather than a branch in TypeScript: the primitive renders the
 * real `disabled` attribute, so the selector is already true and a second
 * source of truth is one that can disagree.
 */
export function HozoButton({
  tone = 'neutral',
  size = 'md',
  className,
  disabled,
  ...rest
}: HozoButtonProps) {
  if (tone === 'accent') {
    return (
      <ButtonPrimitive
        {...rest}
        disabled={disabled}
        className={clsx(
          'inline-flex items-center justify-center gap-2 font-semibold rounded-hozo-control transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-auto disabled:text-hozo-text-subtle bg-hozo-accent text-hozo-on-accent hover:bg-hozo-accent-hover active:opacity-80 disabled:bg-hozo-surface-raised',
          size === 'sm' ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-sm',
          className,
        )}
      />
    )
  }
  if (tone === 'quiet') {
    return (
      <ButtonPrimitive
        {...rest}
        disabled={disabled}
        className={clsx(
          'inline-flex items-center justify-center gap-2 font-semibold rounded-hozo-control transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-auto disabled:text-hozo-text-subtle text-hozo-text-body hover:bg-hozo-surface-hover active:opacity-80',
          size === 'sm' ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-sm',
          className,
        )}
      />
    )
  }
  if (tone === 'danger') {
    return (
      <ButtonPrimitive
        {...rest}
        disabled={disabled}
        className={clsx(
          'inline-flex items-center justify-center gap-2 font-semibold rounded-hozo-control transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-auto disabled:text-hozo-text-subtle bg-hozo-danger text-hozo-on-danger hover:bg-hozo-danger-text active:opacity-80 disabled:bg-hozo-surface-raised',
          size === 'sm' ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-sm',
          className,
        )}
      />
    )
  }
  return (
    <ButtonPrimitive
      {...rest}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-hozo-control transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-auto disabled:text-hozo-text-subtle bg-hozo-surface text-hozo-text-body border border-hozo-border-strong hover:bg-hozo-surface-hover active:opacity-80 disabled:bg-hozo-surface-raised',
        size === 'sm' ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-sm',
        className,
      )}
    />
  )
}
