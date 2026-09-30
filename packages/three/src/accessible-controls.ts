import type { CSSProperties, FocusEvent } from 'react'

/**
 * The two states of the control strip that stands in for a canvas.
 *
 * A canvas has no accessible children, so both Web surfaces build one real DOM
 * control per registered object and park them off-screen. That half was right
 * and is what a screen reader reads. What was missing is the other half: those
 * controls are in the tab order, so a **sighted** keyboard user lands on them,
 * and `clip: rect(0, 0, 0, 0)` means there is nothing to see when they do.
 *
 * Measured before it was fixed (#689), with `check-appearance.mjs`'s harness:
 * the host is 1 by 1 with the clip above, and the button inside it is 136 by 24
 * and carries Chrome's own focus ring -- `outline-style: auto` -- which is
 * clipped away with everything else. So the ring existed and could not be seen,
 * which is WCAG 2.4.7 rather than a missing style.
 *
 * Hidden-until-focused is the established answer, and it is what a skip link
 * does. The strip stays clipped at rest and is revealed while focus is inside
 * it.
 */
export const accessibleOnlyStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/**
 * The same strip, visible, over the canvas's leading corner.
 *
 * System colours rather than a palette, which is not a shortcut: this package
 * ships no CSS and has no theme to read, and `Canvas`/`CanvasText` are the two
 * colours a user agent guarantees contrast between -- including in forced-colors
 * mode, where a hard-coded pair would be overridden anyway. An application that
 * wants its own look passes `controlClassName`.
 *
 * Over the scene rather than beside it, because the alternative is a strip that
 * reflows the page the moment focus enters it: a control that moves what is
 * under the pointer as it appears is worse than one that covers a corner of a
 * picture.
 */
export const revealedControlsStyle: CSSProperties = {
  position: 'absolute',
  insetInlineStart: 0,
  insetBlockStart: 0,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 4,
  padding: 4,
  maxWidth: '100%',
  background: 'Canvas',
  color: 'CanvasText',
}

/**
 * Whether focus has left the strip entirely, rather than moved within it.
 *
 * `blur` fires on every hop between two controls in the same strip, so hiding on
 * any blur makes the strip flicker away under the second Tab -- and a strip that
 * disappears while you are still inside it is worse than one that never showed.
 * `relatedTarget` is where focus is going; if the strip still contains it,
 * nothing has left.
 *
 * `relatedTarget` is `null` when focus leaves the document, which is a real
 * departure and hides it correctly.
 *
 * Duck-typed rather than `instanceof Node`, which reads better and needs a DOM
 * global: this function then throws `ReferenceError: Node is not defined` the
 * moment anything outside a browser calls it, which its own test did first. A
 * `nodeType` is what `contains` needs and is the thing being asked about.
 */
export function focusLeft(event: FocusEvent<HTMLElement>): boolean {
  const next = event.relatedTarget as Node | null
  if (!next || typeof next.nodeType !== 'number') return true
  return !event.currentTarget.contains(next)
}
