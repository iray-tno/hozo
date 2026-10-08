/**
 * Pagination with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is the pattern's: which pages show, the current one marked,
 * the ends disabled in place, links when the pages have addresses. This file
 * draws square controls on the 4px grid and fills the current one.
 *
 * The current page and the disabled ends are styled by the pattern's state
 * class lists rather than by `aria-[current=page]:` and `disabled:`, which
 * would draw nothing on React Native, where there are no selectors.
 */

import { Pagination, type PaginationProps } from '@hozo/core'

export type HozoPaginationProps = PaginationProps

const row = 'flex flex-wrap items-center gap-1 text-sm text-hozo-text-body'
const item =
  'min-w-9 h-9 px-2 items-center justify-center rounded-hozo-control cursor-pointer hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus'
const current = 'bg-hozo-accent text-hozo-on-accent font-medium'
const disabled = 'text-hozo-text-subtle cursor-not-allowed'
const ellipsis = 'px-1 text-hozo-text-subtle'

// Not named `HozoPagination` here: compiled output imports a runtime
// component under that name for the `<Pagination>` below (#670).
function StyledPagination({
  className,
  itemClassName,
  currentItemClassName,
  disabledItemClassName,
  ellipsisClassName,
  ...rest
}: HozoPaginationProps) {
  return (
    <Pagination
      {...rest}
      className={className ? `${row} ${className}` : row}
      itemClassName={itemClassName ? `${item} ${itemClassName}` : item}
      currentItemClassName={currentItemClassName ? `${current} ${currentItemClassName}` : current}
      disabledItemClassName={
        disabledItemClassName ? `${disabled} ${disabledItemClassName}` : disabled
      }
      ellipsisClassName={ellipsisClassName ? `${ellipsis} ${ellipsisClassName}` : ellipsis}
    />
  )
}

export {
  type HozoPaginationProps as PaginationProps,
  StyledPagination as HozoPagination,
  StyledPagination as Pagination,
}
