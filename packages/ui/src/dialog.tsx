/**
 * A modal dialog with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs and is the most-verified thing in the repository:
 * `showModal()`, the focus trap the platform gives with it, Escape through the
 * `cancel` event, focus restored to the opener, and the Native half's
 * `restoreFocusTo` for a platform with no `document.activeElement` (#462).
 * Four issues and two screen-reader harnesses live on that. This file draws a
 * panel and a scrim.
 *
 * ## The element being a real `<dialog>` is what makes this short
 *
 * There is no overlay div to style and no z-index to manage, because the panel
 * *is* the dialog and the scrim is its `::backdrop`. `backdrop:` is a
 * pseudo-element variant Hozo compiles, so the scrim is one class rather than
 * a second element nobody can reach.
 *
 * The scrim has its own token. `bg-hozo-surface-inverse` would have been the
 * obvious reuse and is wrong in the dark: an inverse surface is white there, so
 * the dimming would turn into a flash. `--color-hozo-scrim` is dark in both
 * schemes, which is what a scrim is for -- it is not a surface seen from the
 * other side.
 *
 * It does not blur the page behind it. `backdrop:backdrop-blur-xs` would, on
 * the Web, but React Native has no backdrop filter and the class stops this
 * file compiling for Native. A page that wants the blur adds it to
 * `dialog::backdrop` in its own stylesheet, as Storybook and /docs do.
 *
 * ## Centred by its own class, not by the browser's
 *
 * A modal `<dialog>` is centred by the user agent's `margin: auto`, and any
 * reset that zeroes margins takes that away: Tailwind's preflight does, and so
 * does the /docs preview's, where the dialog opened in the top-left corner.
 * Storybook only centred it because its own stylesheet put `margin: auto`
 * back. `m-auto` here makes the centring the component's, whatever page it
 * opens on.
 *
 * ## No close button, and that is the constraint working
 *
 * A dismiss control is a control: it needs a name, a place in the reading
 * order, and a decision about whether it is the first or last thing focus
 * reaches. That is `@hozo/patterns`' business (#638 §2), and this package
 * would be inventing it. Put a `Button` in the children; Escape already works
 * without one.
 */

import { cx } from '@hozo/core'
import { Dialog as DialogPattern, type DialogProps } from '@hozo/patterns'

export type HozoDialogProps = DialogProps

/**
 * A panel, and a scrim behind it.
 *
 * The width is `max-w-md` against a `w-full`, so it is 28rem on a desktop and
 * the viewport less its margin on a phone. `max-h-[85vh]` with
 * `overflow-y-auto` because the one thing a modal cannot do is put its content
 * somewhere a person cannot scroll to -- a dialog taller than the viewport
 * clips, and the part that goes missing is the bottom, where the buttons are.
 */
const panel =
  'm-auto w-full max-w-md max-h-[85vh] overflow-y-auto rounded-hozo-panel border border-hozo-border bg-hozo-surface p-6 text-hozo-text shadow-hozo-surface backdrop:bg-hozo-scrim/50'

/**
 * Declared as `StyledDialog` and exported under the package's names, which is
 * not a style choice: `Dialog` is a primitive the compiler lowers, and lowering
 * it injects `import { HozoDialog } from '@hozo/core/generated/dialog'` into
 * this module. A function called `HozoDialog` here would be a redeclaration,
 * and the compiler refuses the module with `RUNTIME_IMPORT_COLLISION` (#670) --
 * before that, the bundler did, with a parse error about generated code.
 *
 * Any application component named `HozoDialog` that renders a dialog gets the
 * same refusal, and the same way out: the export names below are unaffected,
 * because an export alias is not a binding.
 */
function StyledDialog({ className, ...rest }: HozoDialogProps) {
  return <DialogPattern {...rest} className={cx(panel, className)} />
}

export { type HozoDialogProps as DialogProps, StyledDialog as Dialog, StyledDialog as HozoDialog }
