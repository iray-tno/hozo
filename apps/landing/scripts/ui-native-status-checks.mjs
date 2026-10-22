/** Check the built explanation against the source-derived report. Do not
 * require a particular component to keep an unapplied prop forever: adding
 * its Native consumer must update the report, not break an unrelated gate.
 * The build generates that report from source (ui-native-status.mjs). */
export function uiNativeStatusChecks(html, expected, page) {
  const label = `docs components/${page}`
  const lines = [
    ...html.matchAll(
      /<div\b(?=[^>]*\bclass="hozo-ui-native(?:\s[^"]*)?")([^>]*)>([\s\S]*?)<\/div>/g,
    ),
  ]
  if (lines.length !== 1)
    return [[false, `${label}: expected one React Native status line, found ${lines.length}`]]
  const [, attributes, body] = lines[0]
  const paragraphs = [
    ...body.matchAll(/<p\b(?=[^>]*\bdata-native-unapplied-props(?:[\s=>]))[^>]*>([\s\S]*?)<\/p>/g),
  ]
  // The marker isolates prop names from unrelated code in a missing utility's
  // reason. Names are identifiers, so no HTML entity decoding is necessary.
  const actualProps = paragraphs
    .flatMap(([, contents]) =>
      [...contents.matchAll(/<code\b[^>]*>([^<]*)<\/code>/g)].map(([, prop]) => prop),
    )
    .sort()
  const expectedProps = [...expected.unapplied].sort()
  return [
    [
      Number(attributes.match(/\bdata-native-missing="(\d+)"/)?.[1]) === expected.missing.length,
      `${label}: the missing class count differs from the generated status`,
    ],
    [
      Number(attributes.match(/\bdata-native-unapplied="(\d+)"/)?.[1]) === expectedProps.length,
      `${label}: the unapplied prop count differs from the generated status`,
    ],
    [
      paragraphs.length === (expectedProps.length > 0 ? 1 : 0),
      `${label}: the unapplied explanation is missing or stale`,
    ],
    [
      actualProps.length === expectedProps.length &&
        actualProps.every((prop, at) => prop === expectedProps[at]),
      `${label}: the rendered unapplied props differ from the generated status`,
    ],
  ]
}
