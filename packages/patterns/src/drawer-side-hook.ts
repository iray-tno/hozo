import { useHozoI18n } from '@hozo/behaviors'
import { type HozoDrawerSide, physicalSide } from './drawer-side.ts'

/**
 * The physical edge for `side` on the Web.
 *
 * The provider's `dir` when one is given (decision 008); otherwise the
 * document's own direction, which the browser has already resolved from
 * `<html dir>` and CSS. A server render has no document and reads `ltr`.
 */
export function useHozoDrawerSide(side: HozoDrawerSide): 'left' | 'right' {
  const { dir } = useHozoI18n()
  const rtl =
    dir !== undefined
      ? dir === 'rtl'
      : typeof document !== 'undefined' &&
        getComputedStyle(document.documentElement).direction === 'rtl'
  return physicalSide(side, rtl)
}
