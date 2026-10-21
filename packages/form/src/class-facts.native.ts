// Non-editable Web wrappers/counters do not borrow the contained field's
// disabled or focus state. Omit unobserved event keys, rather than reporting
// a surrounding control's interaction as the decoration's own.
export const nonControlClassFacts = {
  disabled: false,
  enabled: false,
  readOnly: true,
  'aria-disabled': false,
  'aria-selected': false,
  'aria-checked': false,
} as const
