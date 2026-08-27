// What Tailwind's utilities do when they land on a Canvas shape.
//
// A shape is not an element: it has a fill, a stroke, a stroke width and an
// opacity, and nothing else. So almost every utility is a refusal here, and
// the number that matters is the same one the Native section keeps at
// zero -- how many are refused *without saying so*. A class that quietly
// does nothing on a chart is a chart drawn wrong, and nothing about the
// output looks unusual.
//
// This section exists because Canvas had no denominator at all. Its unit
// tests run in CI and there was nothing enumerating what it should handle,
// nothing counting what it does, and no number to move when it stopped --
// the same state the runtime was in before `runtime-cost.ts`.
//
// Both platforms, because the paint values differ even where the verdicts
// agree: Skia takes a hex and the SVG backend takes the colour Tailwind
// spells. Running one and assuming the other is how a divergence would
// arrive unannounced.

import { compileCanvasPaints } from '@hozo/compiler'

export type CanvasVerdict = 'COVERED' | 'REFUSED' | 'SILENT' | 'UNRESOLVABLE'

export interface CanvasComparison {
  candidate: string
  verdict: CanvasVerdict
  /** The paint attributes it compiled to, for the ones that compiled. */
  replacement?: string
}

/**
 * Runs one class through the Canvas paint lowering, on one platform.
 *
 * `UNRESOLVABLE` is the fourth verdict and the one this section added: a
 * paint prop came out, so the compiler counts it as handled, but the value
 * is a `var()` or a `calc()` -- and neither Canvas 2D's `fillStyle` nor
 * Skia resolves those. On an element the browser would; on a canvas the
 * string is handed to a painting API that has never heard of custom
 * properties. Counting it as covered overstates what happened.
 */
export function compareCanvasCandidate(candidate: string, native: boolean): CanvasComparison {
  const source =
    `import { Canvas } from '@hozo/canvas'\n` +
    `const el = <Canvas><Canvas.Rect className="${candidate}" /></Canvas>\n`
  const edits = compileCanvasPaints(source, native)
  const edit = edits[0]
  if (!edit) return { candidate, verdict: 'SILENT' }

  const untouched = edit.replacement === `className="${candidate}"`
  if (!untouched) {
    const verdict = /var\(|calc\(/.test(edit.replacement) ? 'UNRESOLVABLE' : 'COVERED'
    return { candidate, verdict, replacement: edit.replacement }
  }
  // Left as it was. A diagnostic makes that a refusal the author can read;
  // without one it is a class that vanished.
  return { candidate, verdict: edit.diagnostics.length > 0 ? 'REFUSED' : 'SILENT' }
}
