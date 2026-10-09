/**
 * Which edge a drawer comes from, written physically or by reading direction.
 *
 * `'start'` is the edge a line of text begins at: the left in English, the
 * right in Arabic or Hebrew. A navigation drawer belongs there, so in a
 * right-to-left interface it should open from the right, and `'start'` says
 * that once instead of an application choosing a side per language.
 * `'left'` and `'right'` stay physical for the drawer that really means a
 * side of the screen.
 */
export type HozoDrawerSide = 'left' | 'right' | 'start' | 'end'

export function physicalSide(side: HozoDrawerSide, rtl: boolean): 'left' | 'right' {
  if (side === 'start') return rtl ? 'right' : 'left'
  if (side === 'end') return rtl ? 'left' : 'right'
  return side
}
