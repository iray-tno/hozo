/**
 * A tab strip with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs: one tab stop for the whole strip with the arrows
 * moving within it, the roving `tabIndex`, disabled tabs skipped, the panel
 * that is `hidden` rather than unmounted. This file draws an underline.
 *
 * ## `aria-selected:`, not a prop and not `data-`
 *
 * The pattern marks the chosen tab with `aria-selected`, which is what a reader
 * announces, so it is also what the style hangs off -- one fact, read twice.
 * A `selected` prop here would be a second source of truth, and the disagreement
 * it eventually has is a tab that looks chosen and announces that it is not.
 *
 * Disabled is `aria-disabled:` for the opposite reason: these tabs carry
 * `aria-disabled` rather than the real attribute, because a `disabled` button
 * leaves the tab order and a tab strip's roving focus needs it to stay. So
 * `disabled:` -- which compiles to `[data-hozo-disabled]` -- would match
 * nothing here, and the variant that works is the one naming what the element
 * actually has.
 *
 * ## The indicator moves edge with the orientation
 *
 * A horizontal strip underlines the chosen tab; a vertical one marks its
 * inline end. `border-e-2` rather than `border-r-2`, so the mark is on the
 * inside edge in both directions of text -- the strip flips with the document
 * and a right border would not.
 */

import { type Tab, Tabs as TabsPattern, type TabsProps } from '@hozo/patterns'

export type HozoTabsProps = Omit<TabsProps, 'tabListClassName' | 'tabClassName' | 'panelClassName'>
export type { Tab as HozoTab }

const HORIZONTAL = {
  list: 'flex flex-row gap-1 border-b border-hozo-border',
  tab: 'cursor-pointer px-4 py-2 text-sm font-semibold text-hozo-text-muted border-b-2 border-transparent -mb-px transition-colors hover:text-hozo-text hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-selected:border-hozo-accent aria-selected:text-hozo-accent-text aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent',
} as const

const VERTICAL = {
  list: 'flex flex-col gap-1 border-e border-hozo-border',
  tab: 'cursor-pointer px-4 py-2 text-start text-sm font-semibold text-hozo-text-muted border-e-2 border-transparent -me-px transition-colors hover:text-hozo-text hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-selected:border-hozo-accent aria-selected:text-hozo-accent-text aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent',
} as const

/** A row of tabs beside their panel when vertical, stacked when not. */
const shell = 'w-full'
const sideBySide = 'flex w-full flex-row gap-4'

/**
 * No display utility, on purpose.
 *
 * The pattern hides an unselected panel with the `hidden` attribute, which is
 * `display: none` from the user agent and loses to *any* display class here.
 * One `flex` and every panel is visible at once with `aria-selected` naming
 * one of them -- which `tabs.test.ts` checks, because nothing about the
 * rendered markup would look wrong.
 */
const panel = 'pt-4 text-sm text-hozo-text-body'
const panelBeside = 'flex-1 text-sm text-hozo-text-body'

export function HozoTabs({ className, orientation, ...rest }: HozoTabsProps) {
  const vertical = orientation === 'vertical'
  const own = vertical ? VERTICAL : HORIZONTAL
  const outer = vertical ? sideBySide : shell
  return (
    <TabsPattern
      {...rest}
      orientation={orientation}
      className={className ? `${outer} ${className}` : outer}
      tabListClassName={own.list}
      tabClassName={own.tab}
      panelClassName={vertical ? panelBeside : panel}
    />
  )
}

export { HozoTabs as Tabs, type HozoTabsProps as TabsProps }
