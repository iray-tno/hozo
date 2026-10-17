import type { NonControlSlotFacts } from './slot-facts.native.ts'

// Facts of the actual non-editable Web child, not of its surrounding button. Do not
// fill missing event keys with false: neither direction of an unobserved
// pointer/focus predicate is supported by this Native decoration.
export const nonControlSlotFacts = {
  disabled: false,
  enabled: false,
  readOnly: true,
  'aria-disabled': false,
  'aria-selected': false,
  'aria-checked': false,
} as const satisfies NonControlSlotFacts
