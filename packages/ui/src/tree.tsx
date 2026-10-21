/**
 * A tree with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs: Up and Down between *visible* rows, Right to open a
 * branch or step into it, Left to close it or step out to the parent, typeahead,
 * and `aria-level`/`aria-posinset`/`aria-setsize` carrying the shape that the
 * indentation only shows. This file draws the indentation and the chevron.
 *
 * ## The chevron is drawn, not written
 *
 * A marker element the pattern draws and hides from assistive technology,
 * because a `▾` in the text is *in the accessible name*. The demo this package took its look from has exactly that,
 * and its approved golden records what it costs:
 *
 *     treeitem, ▾ crates, expanded, level 1, position 1, not selected
 *
 * A reader announces the glyph and then announces `expanded`, which is the same
 * fact said twice -- once in a way nobody asked for. A hidden element is not in
 * the accessibility tree, so the marker is seen and never heard. It was a
 * `::before` until #983: React Native has no pseudo-elements, so on a phone
 * there was no marker at all.
 *
 * The geometry, since it is easy to get backwards and a rotation is hard to
 * review: a box with only a bottom and a right border is an angle whose apex
 * points **south-east**. CSS rotates clockwise, so `rotate-45` turns the apex
 * south (a chevron pointing down, an open branch) and `-rotate-45` turns it east
 * (pointing along the text, a closed one).
 *
 * Along the text is west in an RTL locale. So the tree's right border is the
 * logical end one (`border-e-2`), which mirrors the box to an apex pointing
 * south-west there, and each rotation has an `rtl:` twin of the opposite
 * sign: `rtl:rotate-45` turns that apex west and `rtl:-rotate-45` south.
 * Mirroring the box this way rather than with a physical border and a
 * different angle is for React Native: where `doLeftAndRightSwapInRTL`
 * holds it moves a right border to the left in RTL on its own, so only a
 * logical border means the same box on both platforms whatever that says.
 *
 * ## Indentation is a class per depth, written out
 *
 * `ps-${level * 4}` is a class name nothing emitted CSS for: both Tailwind's
 * scanner and Hozo's compiler read class names without running the code, so a
 * template literal produces a row with no indentation at all. So there is a
 * literal per level, and the deepest one repeats past the end of the list --
 * a tree nested eleven deep stops indenting rather than walking off the page.
 *
 * Logical (`ps-`), so the tree indents from the other side in an RTL locale
 * without a second rule.
 *
 * ## A look, not the row's inside
 *
 * The pattern has no opinion about type scale; this package is the layer that
 * does, so it passes `rowLook`: the indentation and the marker as class lists.
 * The pattern draws them and keeps the label in the row's own text styles,
 * which a `renderRow` cannot on React Native. A caller who passes `renderRow`
 * still replaces all of it and owns the row's inside, which is the honest
 * bargain and is why that prop stays in the type.
 */

import { Tree as TreePattern, type TreeProps } from '@hozo/patterns'

/**
 * `toggleOn` is fixed at the pattern's `row`: this look's marker is a chevron,
 * which reads as "this row opens", and at 8px it is no target on its own.
 */
export type HozoTreeProps = Omit<TreeProps, 'rowClassName' | 'rowLook' | 'toggleOn'>
export type { TreeNode as HozoTreeNode } from '@hozo/patterns'

const container =
  'flex flex-col gap-1 rounded-hozo-surface border border-hozo-border bg-hozo-surface p-1'

const row =
  'cursor-pointer rounded-hozo-control p-2 text-sm text-hozo-text hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-selected:bg-hozo-accent-subtle aria-selected:font-semibold aria-selected:text-hozo-accent-text aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent'

/** One literal per depth, because a computed class name emits no CSS. */
const INDENT = ['ps-0', 'ps-5', 'ps-10', 'ps-15', 'ps-20'] as const

/** The row's inside: the marker beside the label. */
const INSIDE = 'flex flex-row items-center gap-2'

/**
 * The marker, in three states, all of which reserve the same width.
 *
 * A leaf gets the space and no ink: without it the labels at one depth would
 * not line up with each other, which is the one thing indentation is for.
 */
const OPEN = 'size-2 rotate-45 rtl:-rotate-45 border-b-2 border-e-2 border-hozo-text-muted'
const CLOSED = 'size-2 -rotate-45 rtl:rotate-45 border-b-2 border-e-2 border-hozo-text-muted'
const LEAF = 'size-2'

export function HozoTree({ className, ...rest }: HozoTreeProps) {
  return (
    <TreePattern
      {...rest}
      className={className ? `${container} ${className}` : container}
      rowClassName={row}
      rowLook={({ level, expanded, branch }) => ({
        indentClassName: `${INSIDE} ${INDENT[Math.min(level - 1, INDENT.length - 1)]}`,
        markerClassName: branch ? (expanded ? OPEN : CLOSED) : LEAF,
      })}
    />
  )
}

export { HozoTree as Tree, type HozoTreeProps as TreeProps }
