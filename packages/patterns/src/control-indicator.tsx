import type { HozoControlIndicatorClasses } from './control-indicator-classes.ts'

/** Phrasing content inside a button, absent unless the caller asks for it. */
export function controlIndicator(look: HozoControlIndicatorClasses | undefined) {
  if (!look) return null
  return (
    <span aria-hidden="true" className={look.className} style={{ pointerEvents: 'none' }}>
      {look.markClassName !== undefined ? <span className={look.markClassName} /> : null}
    </span>
  )
}
