/**
 * Children in a row or a column, with one gap between them.
 *
 * The smallest thing worth having: it exists so that the twelve components
 * that want `flex flex-col gap-4` do not each write it, and so that the gap
 * is a scale rather than a number somebody picked.
 *
 * `gap` names sizes rather than taking a number, because a design system with
 * an open set of gaps has no gaps -- the next person writes `gap-[7px]` and
 * the thing this exists to prevent has happened.
 */

import { cx, View } from '@hozo/core'
import type { ReactNode } from 'react'

export type HozoStackGap = 'none' | 'tight' | 'normal' | 'loose'

export interface HozoStackProps {
  children?: ReactNode
  direction?: 'row' | 'column'
  gap?: HozoStackGap
  /** Cross-axis alignment, which is the one that is wanted often enough. */
  align?: 'start' | 'center' | 'end' | 'stretch'
  className?: string
}

export function HozoStack({
  children,
  direction = 'column',
  gap = 'normal',
  align = 'stretch',
  className,
}: HozoStackProps) {
  // Keep these finite choices at the class boundary: a local joining
  // function hides the resting look beside the caller's candidates (#1152).
  return (
    <View
      className={cx(
        direction === 'row' ? 'flex flex-row' : 'flex flex-col',
        gap === 'none' ? 'gap-0' : gap === 'tight' ? 'gap-2' : gap === 'loose' ? 'gap-6' : 'gap-4',
        align === 'center'
          ? 'items-center'
          : align === 'end'
            ? 'items-end'
            : align === 'stretch'
              ? 'items-stretch'
              : 'items-start',
        className,
      )}
    >
      {children}
    </View>
  )
}

export { HozoStack as Stack, type HozoStackGap as StackGap, type HozoStackProps as StackProps }
