// The primitives the compiler knows, read from the enum that defines them.
//
// `a11y-contextual.ts` holds one cross-platform contract per primitive:
// the same source, and what each backend has to make of it. Those
// expectations cannot be derived -- what `<Nav>` becomes on Web and on
// React Native is Hozo's decision and appears in no specification, which
// is why `aria-roles.ts` could read `aria-query` and that file cannot.
//
// The *coverage* can be derived, and that is the half that goes stale. It
// had: `FlatList`, `ScrollView` and `Svg` were in the enum and in nobody's
// contract, and the only thing that would ever have said so was somebody
// noticing.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

/**
 * Every variant of `hozo_ir::Primitive`.
 *
 * Read from the source for the reason every denominator here is: a copy
 * kept by hand is a copy that drifts, and the drift is invisible because
 * both halves look reasonable.
 *
 * `Svg` carries an element of its own (`Svg(SvgElement)`) and is counted
 * once -- the contract is about the drawing, not about each shape in it.
 */
export function declaredPrimitives(): string[] {
  const source = readFileSync(path.join(repoRoot(), 'crates', 'hozo_ir', 'src', 'lib.rs'), 'utf8')
  const start = source.indexOf('pub enum Primitive {')
  if (start === -1) {
    throw new Error(
      'no `Primitive` enum in hozo_ir -- a denominator that silently became empty is the ' +
        'failure this file exists to prevent',
    )
  }
  const body = source.slice(start, source.indexOf('\n}', start))
  const names = [...body.matchAll(/^ {4}([A-Z][A-Za-z]*)[,(]/gm)].map((match) => match[1])
  if (names.length === 0) throw new Error('the `Primitive` enum parsed as empty')
  return [...new Set(names)].sort()
}
