import { useHozoI18n } from '@hozo/behaviors'
import { I18nManager } from 'react-native'
import { type HozoDrawerSide, physicalSide } from './drawer-side.ts'

/**
 * The physical edge for `side` on React Native: the provider's `dir` when one
 * is given (decision 008), otherwise `I18nManager.isRTL`, which is what the
 * rest of the layout is flipped by.
 */
export function useHozoDrawerSide(side: HozoDrawerSide): 'left' | 'right' {
  const { dir } = useHozoI18n()
  return physicalSide(side, dir !== undefined ? dir === 'rtl' : I18nManager.isRTL)
}
