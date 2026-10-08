/**
 * Which page buttons a pagination shows: `1 … 4 [5] 6 … 20`.
 *
 * The first and last `boundaryCount` pages, `siblingCount` pages either side
 * of the current one, and an ellipsis for each run left out. The length of
 * the result is the same wherever the current page is, once there are pages
 * enough to need an ellipsis: an ellipsis stands in for one page at most when
 * it would hide only one, so the controls never shift under the pointer as
 * the current page moves -- the reason this is the arithmetic most
 * paginations settle on rather than "always an ellipsis".
 */

export type PaginationItem =
  | { type: 'page'; page: number }
  | { type: 'ellipsis'; side: 'start' | 'end' }

export interface PaginationRange {
  page: number
  pageCount: number
  siblingCount?: number
  boundaryCount?: number
}

const range = (from: number, to: number) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index)

export function paginationItems({
  page,
  pageCount,
  siblingCount = 1,
  boundaryCount = 1,
}: PaginationRange): PaginationItem[] {
  const count = Math.max(0, Math.floor(pageCount))
  if (count === 0) return []
  const current = Math.min(Math.max(1, Math.floor(page)), count)
  const startPages = range(1, Math.min(boundaryCount, count))
  const endPages = range(Math.max(count - boundaryCount + 1, boundaryCount + 1), count)
  const siblingsStart = Math.max(
    Math.min(current - siblingCount, count - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  )
  const siblingsEnd = Math.min(
    Math.max(current + siblingCount, boundaryCount + siblingCount * 2 + 2),
    endPages.length > 0 ? (endPages[0] as number) - 2 : count - 1,
  )

  const items: PaginationItem[] = startPages.map((p) => ({ type: 'page', page: p }))
  if (siblingsStart > boundaryCount + 2) {
    items.push({ type: 'ellipsis', side: 'start' })
  } else if (boundaryCount + 1 < count - boundaryCount) {
    items.push({ type: 'page', page: boundaryCount + 1 })
  }
  for (const p of range(siblingsStart, siblingsEnd)) items.push({ type: 'page', page: p })
  if (siblingsEnd < count - boundaryCount - 1) {
    items.push({ type: 'ellipsis', side: 'end' })
  } else if (count - boundaryCount > boundaryCount) {
    items.push({ type: 'page', page: count - boundaryCount })
  }
  for (const p of endPages) items.push({ type: 'page', page: p })
  return items
}
