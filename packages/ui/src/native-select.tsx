/**
 * A platform select with a look, wearing `@hozo/form`.
 *
 * The behaviour is theirs, and on this platform it is a `<select>` and nothing
 * else: no portal, no focus management, no runtime. This file styles the closed
 * box.
 *
 * ## Only the closed box, and that is the honest limit
 *
 * The open list belongs to the operating system and cannot be styled, which is
 * the whole bargain of this component and the reason `@hozo/form`'s README argues
 * *against* platform pickers elsewhere. It survives the argument here because a
 * `<select>` is already the platform's picker on the Web -- it opens the wheel on
 * iOS Safari -- so this is the same decision on both sides rather than ours
 * against theirs. `Listbox` and `Combobox` are the components whose list is ours
 * to draw.
 *
 * The chevron is the user agent's too, for the same reason. Drawing one would mean
 * `appearance-none`, and `appearance-none` on a `<select>` takes the platform
 * rendering away on the mobile browsers this exists for.
 *
 * ## The same list as `Input`'s, which is the point
 *
 * A select and a text field sitting in the same form should be the same height
 * with the same border and the same ring. The two lists are written out
 * separately anyway, for the reason `button.tsx` gives -- Hozo compiles a
 * statically readable `className` into a rule, and a shared constant joined at
 * runtime would take the project-wide fallback path -- but they are deliberately
 * the same words.
 *
 * `py-2 leading-6` is 40px tall, the same as `Input` and past WCAG 2.5.8's 24.
 */

import { NativeSelect as NativeSelectBase, type NativeSelectProps } from '@hozo/form'

export type HozoNativeSelectProps = Omit<
  NativeSelectProps,
  'className' | 'sheetClassName' | 'scrimClassName' | 'optionClassName'
>

const field =
  'w-full rounded-hozo-control border bg-hozo-surface px-3 py-2 text-sm leading-6 text-hozo-text border-hozo-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-invalid:border-hozo-danger disabled:bg-hozo-surface-raised disabled:text-hozo-text-subtle disabled:cursor-not-allowed'

export function HozoNativeSelect(props: HozoNativeSelectProps) {
  return <NativeSelectBase {...props} className={field} />
}

export { HozoNativeSelect as NativeSelect, type HozoNativeSelectProps as NativeSelectProps }
