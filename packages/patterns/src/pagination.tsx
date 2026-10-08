import { useHozoI18n, useHozoMessage } from '@hozo/behaviors'
import { type ReactNode, useCallback, useState } from 'react'
import { paginationItems } from './pagination-rules.ts'

export interface HozoPaginationProps {
  /** The current page, counted from 1. Controlled with `onPageChange`. */
  page?: number
  defaultPage?: number
  onPageChange?: (page: number) => void
  pageCount: number
  /** Pages shown either side of the current one; 1 by default. */
  siblingCount?: number
  /** Pages always shown at each end; 1 by default. */
  boundaryCount?: number
  /**
   * Makes every page a link to this address instead of a button. A page
   * that is a URL should be one: it can be opened in a new tab, shared and
   * bookmarked, and a reader announces a link as somewhere to go rather
   * than something to do. `onPageChange` is still called on activation.
   */
  getPageHref?: (page: number) => string
  /** The navigation's name, "Pagination" by default. */
  accessibilityLabel?: string
  /** What the previous and next controls show; chevrons by default. */
  previousIcon?: ReactNode
  nextIcon?: ReactNode
  /** The row of controls -- the list inside the `<nav>`. */
  className?: string
  /** Every control: the pages, previous and next. */
  itemClassName?: string
  /** Added to the current page's control. */
  currentItemClassName?: string
  /** Added to previous or next when there is nowhere to go. */
  disabledItemClassName?: string
  ellipsisClassName?: string
  testID?: string
}

/**
 * Numbered pages with previous and next (#150).
 *
 * ## A navigation landmark of buttons, or of links
 *
 * A `<nav>` named "Pagination", holding a list, so a reader can jump to it
 * and hears how many controls there are. Each page says "Page 5" and the
 * current one is `aria-current="page"`; previous and next are named for what
 * they do and disabled at the ends rather than removed, so the controls do
 * not move under a pointer. The ellipses are hidden: "…" read aloud is not
 * information.
 *
 * With `getPageHref` every page is an `<a href>`, which is what a page with
 * an address should be; the document-level navigation adapter routes it
 * like any other link.
 *
 * ## State is styled by class lists, not selectors
 *
 * `currentItemClassName` and `disabledItemClassName` are added by this
 * component to the control in that state. On the Web `aria-[current=page]:`
 * would do as well; on React Native there are no selectors, and a look that
 * depended on one would be a look one platform lacks.
 */
export function HozoPagination({
  page,
  defaultPage,
  onPageChange,
  pageCount,
  siblingCount,
  boundaryCount,
  getPageHref,
  accessibilityLabel,
  previousIcon,
  nextIcon,
  className,
  itemClassName,
  currentItemClassName,
  disabledItemClassName,
  ellipsisClassName,
  testID,
}: HozoPaginationProps) {
  const message = useHozoMessage()
  const { dir } = useHozoI18n()
  const [uncontrolled, setUncontrolled] = useState(defaultPage ?? 1)
  const current = Math.min(Math.max(1, page ?? uncontrolled), Math.max(1, pageCount))
  const go = useCallback(
    (next: number) => {
      if (page === undefined) setUncontrolled(next)
      onPageChange?.(next)
    },
    [onPageChange, page],
  )
  const items = paginationItems({ page: current, pageCount, siblingCount, boundaryCount })
  // Chevrons point the way the reading runs.
  const back = previousIcon ?? (dir === 'rtl' ? '›' : '‹')
  const forward = nextIcon ?? (dir === 'rtl' ? '‹' : '›')

  const control = (
    target: number,
    label: string,
    content: ReactNode,
    state: 'current' | 'disabled' | 'idle',
  ) => {
    const classes =
      [
        itemClassName,
        state === 'current' && currentItemClassName,
        state === 'disabled' && disabledItemClassName,
      ]
        .filter(Boolean)
        .join(' ') || undefined
    if (getPageHref) {
      return state === 'disabled' ? (
        // What `Link` does when disabled: announced as unavailable and not
        // followed. The address stays, since an `<a>` without one is not a
        // link at all and drops out of the reader's list of links.
        <a
          href={getPageHref(Math.min(Math.max(1, target), Math.max(1, pageCount)))}
          aria-label={label}
          aria-disabled
          data-hozo-disabled=""
          className={classes}
          onClick={(event) => event.preventDefault()}
        >
          {content}
        </a>
      ) : (
        <a
          href={getPageHref(target)}
          aria-label={label}
          aria-current={state === 'current' ? 'page' : undefined}
          className={classes}
          onClick={() => go(target)}
        >
          {content}
        </a>
      )
    }
    return (
      <button
        type="button"
        aria-label={label}
        aria-current={state === 'current' ? 'page' : undefined}
        disabled={state === 'disabled'}
        className={classes}
        onClick={() => go(target)}
      >
        {content}
      </button>
    )
  }

  return (
    <nav aria-label={message('hozo.pagination.label', {}, accessibilityLabel)} data-testid={testID}>
      <ul className={className} style={UNMARKED}>
        <li>
          {control(
            current - 1,
            message('hozo.pagination.previous'),
            <span aria-hidden>{back}</span>,
            current <= 1 ? 'disabled' : 'idle',
          )}
        </li>
        {items.map((item) =>
          item.type === 'ellipsis' ? (
            <li key={`ellipsis-${item.side}`} aria-hidden className={ellipsisClassName}>
              …
            </li>
          ) : (
            <li key={item.page}>
              {control(
                item.page,
                message('hozo.pagination.page', { page: item.page }),
                item.page,
                item.page === current ? 'current' : 'idle',
              )}
            </li>
          ),
        )}
        <li>
          {control(
            current + 1,
            message('hozo.pagination.next'),
            <span aria-hidden>{forward}</span>,
            current >= pageCount ? 'disabled' : 'idle',
          )}
        </li>
      </ul>
    </nav>
  )
}

/**
 * No bullets, whatever the page's CSS: discs beside page numbers are broken
 * rather than unstyled. The one inline style, because an author's class
 * cannot lose to it -- `list-*` is the only utility that sets it -- where
 * a margin or a padding here would beat `className`'s.
 */
const UNMARKED = { listStyle: 'none' } as const

export { HozoPagination as Pagination, type HozoPaginationProps as PaginationProps }
