// The base a relative text size scales against.
//
// Here rather than beside the components that use it because a React
// context is not a platform concept, and because `@hozo/typography`
// reads it: a package resolves this one's types through the Web entry
// whichever platform it is building for, so a native-only export is one
// its type checker cannot see.

import { createContext, useContext } from 'react'

/**
 * React Native's own default, from `RCTFont.mm`:
 * `const CGFloat defaultFontSize = 14`.
 *
 * The base when nothing above has named one, which is what React Native
 * itself would have drawn at.
 */
export const HOZO_DEFAULT_FONT_SIZE = 14

export const HozoTextSizeContext = createContext(HOZO_DEFAULT_FONT_SIZE)

/** The size in force here, for a component sizing itself against it. */
export function useHozoTextSize() {
  return useContext(HozoTextSizeContext)
}
