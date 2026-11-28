// What Tailwind's utilities do when they land on Canvas scene members.
//
// Canvas shapes are not DOM elements: `Canvas.Rect` (and Circle/Ellipse/Line/
// Path) take paint props (`fill`, `stroke`, `strokeWidth`, `opacity`),
// `Canvas.RoundedRect` adds `radius`, `Canvas.Text` adds typography and
// wrapping props, and `Canvas.Group` takes `opacity` and 2D `transform`.
// Everything else is a refusal here, and the number that matters is the same
// one the Native section keeps at zero -- how many are refused *without
// saying so*. A class that quietly does nothing on a chart is a chart drawn
// wrong, and nothing about the output looks unusual.
//
// This section exists because Canvas had no denominator at all. Its unit
// tests run in CI and there was nothing enumerating what it should handle,
// nothing counting what it does, and no number to move when it stopped --
// the same state the runtime was in before `runtime-cost.ts`.
//
// Both platforms, because the paint and font values differ even where the
// verdicts agree: Skia takes a hex/rgba and a single system font family while
// Canvas 2D takes the CSS colour and font stack Tailwind spells. Running one
// and assuming the other is how a divergence would arrive unannounced.

import { compileCanvasPaints } from '@hozo/compiler'

export type CanvasVerdict = 'COVERED' | 'REFUSED' | 'SILENT' | 'UNRESOLVABLE'

export interface CanvasComparison {
  candidate: string
  verdict: CanvasVerdict
  /** The paint/shape attributes it compiled to, for the ones that compiled. */
  replacement?: string
  /** When the utility only lowers on a specific Canvas member beyond Rect. */
  restrictedTo?: string
}

const SHAPE_PROBES: readonly { member: string; restrictedTo?: string }[] = [
  { member: 'Rect' },
  { member: 'RoundedRect', restrictedTo: 'Canvas.RoundedRect' },
  { member: 'Text', restrictedTo: 'Canvas.Text' },
  { member: 'Group', restrictedTo: 'Canvas.Group' },
]

function probeCanvasMember(
  candidate: string,
  member: string,
  native: boolean,
  restrictedTo?: string,
): CanvasComparison {
  const source =
    `import { Canvas } from '@hozo/canvas'\n` +
    `const el = <Canvas><Canvas.${member} className="${candidate}" /></Canvas>\n`
  const edits = compileCanvasPaints(source, native)
  const edit = edits[0]
  if (!edit) return { candidate, verdict: 'SILENT' }

  const untouched = edit.replacement === `className="${candidate}"`
  if (!untouched) {
    if (edit.diagnostics.length > 0) return { candidate, verdict: 'REFUSED' }
    const verdict = /var\(|calc\(|hozo-unresolved:/.test(edit.replacement)
      ? 'UNRESOLVABLE'
      : 'COVERED'
    return { candidate, verdict, replacement: edit.replacement, restrictedTo }
  }
  // Left as it was. A diagnostic makes that a refusal the author can read;
  // without one it is a class that vanished.
  return { candidate, verdict: edit.diagnostics.length > 0 ? 'REFUSED' : 'SILENT' }
}

/**
 * Runs one class through the Canvas lowering across its scene members, on one
 * platform.
 *
 * `UNRESOLVABLE` is the fourth verdict and the one this section added: a
 * prop came out, so the compiler counts it as handled, but the value is a
 * `var()`, `calc()`, or `hozo-unresolved:` marker -- and neither Canvas 2D
 * nor Skia resolves those. Counting it as covered overstates what happened.
 */
export function compareCanvasCandidate(candidate: string, native: boolean): CanvasComparison {
  let firstRefusal: CanvasComparison | undefined
  for (const probe of SHAPE_PROBES) {
    const result = probeCanvasMember(candidate, probe.member, native, probe.restrictedTo)
    // Never hide a SILENT or UNRESOLVABLE result on one shape behind a clean
    // verdict on another.
    if (result.verdict === 'SILENT' || result.verdict === 'UNRESOLVABLE') return result
    if (result.verdict === 'COVERED') return result
    firstRefusal ??= result
  }
  return firstRefusal ?? { candidate, verdict: 'REFUSED' }
}
