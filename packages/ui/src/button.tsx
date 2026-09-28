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
 * ## Why the class lists are written out
 *
 * Every combination is a complete literal, chosen by a `switch`, rather than
 * pieces joined at runtime. Two different tools need to see them and neither
 * runs the code: Tailwind's scanner has to find the class names to emit their
 * CSS, and Hozo's compiler resolves a `className` it can read statically and
 * falls back to the project-wide candidate sheet for one it cannot. A library
 * whose own classes take the fallback path would be arguing against itself.
 *
 * It is repetitive on purpose. The alternative -- `[base, sizes[tone]].join()`
 * -- reads better and is invisible to both tools.
 */

import { Button as ButtonPrimitive, type ButtonProps } from '@hozo/primitives'

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
 * `disabled:` rather than a branch in TypeScript: the primitive renders the
 * real `disabled` attribute, so the selector is already true and a second
 * source of truth is one that can disagree.
 */
function classes(tone: HozoButtonTone, size: HozoButtonSize): string {
  const accent =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-hozo-control transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-not-allowed disabled:text-hozo-text-subtle bg-hozo-accent text-hozo-on-accent hover:bg-hozo-accent-hover disabled:bg-hozo-surface-raised'
  const neutral =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-hozo-control transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-not-allowed disabled:text-hozo-text-subtle bg-hozo-surface text-hozo-text-body border border-hozo-border-strong hover:bg-hozo-surface-hover disabled:bg-hozo-surface-raised'
  const quiet =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-hozo-control transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-not-allowed disabled:text-hozo-text-subtle text-hozo-text-body hover:bg-hozo-surface-hover'
  const danger =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-hozo-control transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:cursor-not-allowed disabled:text-hozo-text-subtle bg-hozo-danger text-hozo-on-danger hover:bg-hozo-danger-text disabled:bg-hozo-surface-raised'
  const padding = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm'
  if (tone === 'accent') return `${accent} ${padding}`
  if (tone === 'quiet') return `${quiet} ${padding}`
  if (tone === 'danger') return `${danger} ${padding}`
  return `${neutral} ${padding}`
}

export function HozoButton({ tone = 'neutral', size = 'md', className, ...rest }: HozoButtonProps) {
  const own = classes(tone, size)
  return <ButtonPrimitive {...rest} className={className ? `${own} ${className}` : own} />
}

export {
  HozoButton as Button,
  type HozoButtonProps as ButtonProps,
  type HozoButtonSize as ButtonSize,
  type HozoButtonTone as ButtonTone,
}
