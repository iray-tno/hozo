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
//   - `peer-*`, `has-*`, `focus-within`: a sibling's or a descendant's
//     state is visible to a compiler that sees the JSX, or to a context.
//   - `data-*`: Hozo already answers declared owner facts and Presence.
//   - `placeholder:`, `selection:`: TextInput has `placeholderTextColor`
//     and `selectionColor`.
//   - `placeholder-shown:`: whether a TextInput is empty is in its value.
//   - `backdrop:`: a Modal has a scrim to style.
//   - `max-[40rem]`: `rem` could be given a fixed size.
//   - `group-*` the context does not carry, `*-of-type`: not built yet.
export const NO_NATIVE_COUNTERPART: Readonly<Record<string, string>> = {
  print: 'There is no print media; an app is not printed from its styles.',
  noscript: 'There is no page that could run with scripting off.',
  'forced-colors': "Windows' forced-colours mode does not exist on iOS or Android.",
  'contrast-less': 'iOS and Android offer an increase-contrast setting and no reduce-contrast one.',
  target: 'There is no document URL whose fragment could point at an element.',
  visited: 'There is no browsing history and no links to have visited.',
  required: 'React Native has no constraint validation: no `required` attribute to read.',
  invalid: 'React Native has no constraint validation to fail.',
  'user-invalid': 'React Native has no constraint validation to fail.',
  autofill: 'React Native exposes no autofilled state for a field.',
  before: 'React Native has no pseudo-elements; there is no box before the content.',
  after: 'React Native has no pseudo-elements; there is no box after the content.',
  marker: 'React Native has no list items, so no list marker.',
  'first-letter': 'Text cannot be styled by its first letter as a separate box.',
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
