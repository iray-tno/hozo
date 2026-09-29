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
 * `::before` on the row's inner span, because a `▾` in the text is *in the
 * accessible name*. The demo this package took its look from has exactly that,
 * and its approved golden records what it costs:
 *
 *     treeitem, ▾ crates, expanded, level 1, position 1, not selected
 *
 * A reader announces the glyph and then announces `expanded`, which is the same
 * fact said twice -- once in a way nobody asked for. A pseudo-element is not in
 * the accessibility tree at all, so the marker is seen and never heard.
 *
 * The geometry, since it is easy to get backwards and a rotation is hard to
 * review: a box with only a bottom and a right border is an angle whose apex
 * points **south-east**. CSS rotates clockwise, so `rotate-45` turns the apex
 * south (a chevron pointing down, an open branch) and `-rotate-45` turns it east
 * (pointing along the text, a closed one).
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
 * ## Which means this component owns `renderRow`
 *
 * The pattern leaves the row's inside to the caller deliberately -- it has no
 * opinion about type scale. This package is the layer that does, so it passes
 * its own: label, indentation, marker. A caller who passes `renderRow` replaces
 * all three and owns the row's inside, which is the honest bargain and is why
 * the prop stays in the type.
 */

import { Tree as TreePattern, type TreeProps } from '@hozo/patterns'

export type HozoTreeProps = Omit<TreeProps, 'rowClassName'>
export type { TreeNode as HozoTreeNode } from '@hozo/patterns'

const container =
  'flex flex-col gap-0.5 rounded-hozo-surface border border-hozo-border bg-hozo-surface p-1'

const row =
  'cursor-pointer rounded-hozo-control px-2 py-1.5 text-sm text-hozo-text hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-selected:bg-hozo-accent-subtle aria-selected:font-semibold aria-selected:text-hozo-accent-text aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent'

/** One literal per depth, because a computed class name emits no CSS. */
const INDENT = ['ps-0', 'ps-5', 'ps-10', 'ps-15', 'ps-20'] as const

/**
 * The marker, in three states, all of which reserve the same width.
 *
 * A leaf gets the space and no ink: without it the labels at one depth would
 * not line up with each other, which is the one thing indentation is for.
 */
const OPEN =
  "relative ps-4 before:content-[''] before:absolute before:start-0 before:top-1/2 before:-mt-1 before:size-2 before:rotate-45 before:border-b-2 before:border-r-2 before:border-hozo-text-muted"
const CLOSED =
  "relative ps-4 before:content-[''] before:absolute before:start-0 before:top-1/2 before:-mt-1 before:size-2 before:-rotate-45 before:border-b-2 before:border-r-2 before:border-hozo-text-muted"
const LEAF = 'relative ps-4'

export function HozoTree({ className, renderRow, ...rest }: HozoTreeProps) {
  return (
    <TreePattern
      {...rest}
      className={className ? `${container} ${className}` : container}
      rowClassName={row}
      renderRow={
        renderRow ??
        (({ label, level, expanded, branch }) => (
          <span className={INDENT[Math.min(level - 1, INDENT.length - 1)]}>
            <span className={branch ? (expanded ? OPEN : CLOSED) : LEAF}>{label}</span>
          </span>
        ))
      }
    />
  )
}

export { HozoTree as Tree, type HozoTreeProps as TreeProps }
