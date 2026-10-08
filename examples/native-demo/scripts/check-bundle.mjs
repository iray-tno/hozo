// Reads the bundle back.
//
// Building is not enough on its own: Metro will happily bundle a module
// that refers to an identifier nothing imported, because that is only an
// error when it runs. Exactly that shipped -- a compiled `TextInput` with
// no import behind it -- and the build was green. So the bundle is read.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const bundle = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.bundle.js'),
  'utf8',
)

// The compiled App, located by a string only it contains.
const marker = bundle.indexOf('you@example.com')
if (marker === -1) throw new Error('the example App is not in the bundle')
const app = bundle.slice(marker - 4000, marker + 2000)

const failures = []
const expect = (condition, description) => {
  if (!condition) failures.push(description)
}

// Every primitive the example uses reaches the bundle bound to something.
for (const component of ['View', 'Text', 'TextInput', 'Image', 'ScrollView']) {
  expect(app.includes(`_reactNative.${component}`), `${component} is imported from react-native`)
}
expect(app.includes('HozoFlatList'), 'HozoFlatList is used for virtualized lists')
expect(/HozoSpaced/.test(bundle), 'HozoSpaced is bundled')
expect(/HozoDialog/.test(bundle), 'HozoDialog is bundled')
expect(/smoke-grid/.test(bundle), 'the device acceptance grid is bundled')
expect(/smoke-horizontal-scroll/.test(bundle), 'the horizontal ScrollView fixture is bundled')
expect(/smoke-row-/.test(bundle), 'the virtualized renderItem fixture is bundled')

// Canvas is deliberately not here. Skia is an optional peer and a
// multi-megabyte one: folding it in took this bundle from 4.4 MB to
// 5.7 MB, past the budget below, and that budget measures what Hozo costs
// a typical app -- a number that stops meaning anything with an optional
// renderer most apps never install inside it. It has its own entry and
// its own check; see `check-canvas-bundle.mjs`.
expect(!/react-native-skia/.test(bundle), 'Skia stayed out of the ordinary bundle')

// The utilities became styles and props, and no className survived.
expect(app.includes('placeholderTextColor'), 'placeholder-* became a TextInput prop')
expect(app.includes('accessibilityLabel'), 'the accessible name reached the field')
expect(!/className/.test(app), 'no className is left in the compiled output')
expect(/style: hozoStyles\./.test(app), 'elements reference the generated StyleSheet')

// Text styles set on the View were carried down rather than left behind.
expect(/fontSize:/.test(bundle), 'text styles reached the StyleSheet')

// The project's own theme, not Tailwind's defaults:  sets
// --spacing to 0.2rem, so  is 19.2 rather than 24, and --color-brand
// resolves to a real hex rather than the not-a-colour marker.
// The three theme assertions were here *and* again below, in a second
// block with its own reporting. Two copies of one rule is the thing this
// repository keeps finding drifted, and these had already started to: the
// pair below is what actually gates, because this block exits first.
// Kept there, deleted here.

// What Hozo adds to a Native app, measured as Hozo's own modules.
//
// This used to be one budget on the whole bundle, 4.6 MB, and the whole
// bundle is mostly not Hozo: React Native is 2.8 MB of it and the dev-only
// devtools another 0.8 MB, and the total differs by machine (4,648,596
// bytes locally against 4,685,584 in CI for the same commit). It crossed
// 4.6 MB as Hozo grew components -- Metro does not tree-shake, so an app
// that imports `@hozo/form` carries every form component -- and since only
// the Pages workflow runs this, nobody saw it fail from 2026-10-02.
//
// So the budget that means something is on Hozo's share: every module
// under the workspace's `packages/`, by its relative module name, which
// does not depend on where the repo is checked out. 450,930 bytes in 117
// modules when this was written. Crossing 500 KB is worth a look at which
// package grew and whether an app that does not use the feature now pays
// for it.
//
// Raised to 510 KB by #788, which crossed it at 501,200: Native `Meter`
// began drawing its bar, which is `@hozo/semantics`' `meter-gauge` (2 KB,
// paid by every app, since Metro does not tree-shake the semantics entry)
// and the `HozoMeter` leaves the census screen's compiled Meter imports
// (1.1 KB). A feature that was missing, not one an app pays for twice.
const hozoBytes = (() => {
  const starts = [...bundle.matchAll(/__d\(function/g)].map((match) => match.index)
  starts.push(bundle.length)
  let bytes = 0
  for (let index = 0; index < starts.length - 1; index++) {
    const module = bundle.slice(starts[index], starts[index + 1])
    const name = module.match(/,"([^"]+)"\);/)?.[1] ?? ''
    if (/(^|[\\/])packages[\\/]/.test(name) && !/node_modules/.test(name)) bytes += module.length
  }
  return bytes
})()
expect(hozoBytes > 0, "Hozo's own modules were found in the bundle by name")
expect(
  hozoBytes < 510_000,
  `Hozo's modules stay below 510 KB of the Native dev bundle (were ${hozoBytes} bytes)`,
)

// And a coarse ceiling on the whole, for the regression this check began
// as: a feature pulling a second platform layer or another large dependency
// into every Native app. Skia was that once (+1.3 MB, now its own entry).
expect(bundle.length < 5_000_000, `Native dev bundle stays below 5 MB (was ${bundle.length} bytes)`)

if (failures.length > 0) {
  console.error('bundle check failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`bundle check passed (${bundle.length} bytes)`)

// The project's own theme rather than Tailwind's defaults. `global.css`
// sets `--spacing` to 0.2rem, so `p-6` is 19.2px and not 24; and
// `--color-brand` resolves to a real hex rather than the marker the
// compiler emits for a token it can't resolve.
//
// Asked of the whole bundle rather than the window around the App, and
// that is a correction rather than a loosening. The window is 6000
// characters either side of a string in the source; adding a safe-area
// inset to the root element pushed this number out of it, and the check
// then reported that the project's spacing scale had not reached the
// styles when the styles were right there in the same file. The number is
// what makes it specific -- 19.2 is `p-6` against this project's 0.2rem
// spacing, where Tailwind's default would be 24 -- so it does not need a
// position as well.
const themed = []
if (!/paddingTop: 19\.2/.test(bundle)) themed.push('the project spacing scale reached the styles')
if (!bundle.includes('#3581f6')) themed.push('the project colour resolved')
if (/hozo-unresolved/.test(bundle)) themed.push('no colour was left unresolved')

if (themed.length > 0) {
  console.error('theme check failed:')
  for (const failure of themed) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log('theme check passed')
