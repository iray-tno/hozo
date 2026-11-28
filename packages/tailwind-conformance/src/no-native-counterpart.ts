// Variants that have nothing to be on React Native: what they ask about does
// not exist there. The Native variant matrix crosses every variant with
// every other, so each of these takes about 600 cases with it, and a
// headline of "covered / total" read as a measure of how much is left to
// build was mostly measuring these. The report keeps them in the total and
// counts them separately, so the number can be read either way.
//
// A variant belongs here only when two things hold:
// - The compiler already refuses it everywhere and says why in terms of the
//   platform -- `run.ts` throws if a case counted here is covered, so the
//   list cannot hide something Hozo supports.
// - Nothing in React Native could be wired to answer it. That is a
//   judgement, so it is made narrowly. Left out on purpose, although every
//   one is refused today:
//   - `supports-[...]`: CSS feature queries evaluate at build time against
//     React Native's known Yoga/StyleSheet capability; unsupported features
//     warn and omit cleanly rather than being absent from the platform.
//   - unwired `has-*` / `peer-*` / `group-*` states beyond modeled props and
//     descendant/sibling interaction contexts.
//   - `placeholder:`, `selection:`, `first-letter:`: inline/prop-backed slices
//     lower on Native (`placeholderTextColor`, `selectionColor`, inline nested
//     `<Text>`), while unsupported box/layout properties stay refused.
//   - `placeholder-shown:`, `required:`, `invalid:`, `user-invalid:`: driven
//     from `TextInput`'s authored props (`value`, `required`, `aria-invalid`)
//     and `HozoTextInput`'s `touched` state.
//   - `marker:`, `before:`, `after:`, `backdrop:`: synthesized on compatible
//     Native primitives (`List`/`ListItem`, box containers, `Dialog`).
//   - `max-[40rem]`: `rem` could be given a fixed size.
//   - unwired `group-*` states (such as `group-open`, `group-data-*`) not
//     carried by the ancestor's interaction context or modeled props.
//   - `*-of-type`: refused by decision 003, since React Native has no tags.
//     That is Hozo's choice about a Web lowering, not the platform lacking
//     sibling order, so it is not listed here either.
export const NO_NATIVE_COUNTERPART: Readonly<Record<string, string>> = {
  print: 'There is no print media; an app is not printed from its styles.',
  noscript: 'There is no page that could run with scripting off.',
  'forced-colors': "Windows' forced-colours mode does not exist on iOS or Android.",
  'contrast-less': 'iOS and Android offer an increase-contrast setting and no reduce-contrast one.',
  target: 'There is no document URL whose fragment could point at an element.',
  visited: 'There is no browsing history and no links to have visited.',
  autofill: 'React Native exposes no autofilled state for a field.',
  file: 'There is no file input, so no file-selector button.',
}

/** Whether a variant-catalog candidate uses one of the variants above. */
export function hasNoNativeCounterpart(candidate: string): boolean {
  // Catalog candidates are `a:util` or `a:b:util`. None of the listed
  // names contains `:` or a bracket, so a prefix or `:name:` test cannot
  // match inside an arbitrary value like `supports-[display:grid]`.
  return Object.keys(NO_NATIVE_COUNTERPART).some(
    (variant) => candidate.startsWith(`${variant}:`) || candidate.includes(`:${variant}:`),
  )
}
