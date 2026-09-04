// Reads the Canvas bundle back.
//
// `packages/canvas` has thirty-odd tests and every one drives the Web
// surface: `index.native.tsx` is type-checked and never executed, and
// until recently it was type-checked against a hand-written Skia stub
// that agreed with anything. Metro is not a device, but running the real
// bundler over the real module establishes what those tests cannot --
// that it resolves, that Skia resolves with it, and that the shared hit
// test travels with it rather than being a Web-only file that compiles.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const bundle = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'canvas.bundle.js'),
  'utf8',
)

const failures = []
const expect = (condition, description) => {
  if (!condition) failures.push(description)
}

expect(/canvas-surface/.test(bundle), 'the Canvas fixture is bundled')
expect(/react-native-skia/.test(bundle), 'Skia is resolved and bundled')
// The hit test and the paint predicate are shared with the Web surface.
// Their presence here is what says the Native adapter reads the same
// geometry rather than a parallel implementation nobody compares.
expect(/hitTestCanvas/.test(bundle), 'the shared hit test reached the Native bundle')
expect(/pointInLine/.test(bundle), 'line hit testing reached the Native bundle')
expect(/paintStrokes/.test(bundle), 'the shared paint predicate reached the Native bundle')
// The fixture references every shape the Native adapter branches on, so
// each branch is one Metro actually had to resolve.
expect(/canvas-indicated/.test(bundle), 'the active-target fixture is bundled')
// Text is the one shape whose Native branch does work of its own: Skia
// resolves the face through `matchFont` and has no alignment, so the
// adapter measures. Neither call appears on the Web side.
// Every named pressable shape becomes a real accessibility element, so
// a screen reader can reach geometry that is otherwise pixels. The
// labels are the evidence that the derived-control layer is in the
// bundle at all.
expect(/January revenue/.test(bundle), 'the derived accessibility controls are bundled')
expect(/onAccessibilityTap/.test(bundle), 'the Native activation path reached the bundle')
// A path is answered by Skia rather than by the shared hit test, which
// is the one place the two surfaces deliberately do not share geometry.
// Skia takes a gradient as a shader element inside the shape, which is
// a different shape of answer from Canvas2D's gradient object -- so the
// Native branch is its own code and worth asserting reached the bundle.
expect(/LinearGradient/.test(bundle), 'the Native gradient shader reached the bundle')
expect(/MakeFromSVGString/.test(bundle), 'the Native path parser reached the bundle')
expect(/matchFont/.test(bundle), 'the Native font lookup reached the bundle')
expect(/measureText/.test(bundle), 'the Native text alignment measurement reached the bundle')

if (failures.length > 0) {
  console.error('Canvas bundle check failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`Canvas bundle check passed (${(bundle.length / 1024 / 1024).toFixed(1)} MB)`)
