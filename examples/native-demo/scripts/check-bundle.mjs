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
//
// Raised to 525 KB by #144's Avatar, which crossed 510 at 514,465: the
// pattern, its initials and its text-style split (8.3 KB together, paid by
// every app, since `@hozo/core` re-exports `@hozo/patterns` whole), and the
// `HozoAvatar`/`HozoChip` leaves the census screen now imports (2.3 KB).
// Every new component costs every app this until the facade is split, so a
// number that keeps moving is the argument for splitting it.
//
// Raised to 545 KB by #150's Stepper, which crossed 525 at 533,434 with
// Pagination beside it: the two patterns and their rules are 14.4 KB, and
// the census screen's leaves for them 2.3 KB. Third raise in a week -- the
// facade split above is now the open question, not the number.
//
// Raised to 560 KB by #144's Table, which crossed 545 at 549,107: the
// runtime parts are 11.5 KB (every app, through `@hozo/semantics`' entry)
// and the census screen's leaves 1.9 KB. Recorded on #683 as well.
//
// Raised to 590 KB by #152's CommandPalette, which crossed 560 at 574,439:
// the pattern, its ranking and the shortcut hook are 12.2 KB (every app),
// the census screen's leaves 1.2 KB. #149's OtpInput had already used most
// of the room that 560 left. Fifth raise; #683 again.
//
// Raised to 610 KB by #153's ColorPicker, which crossed 590 at 590,893: the
// pattern, its colour arithmetic and names are 13 KB (every app), the
// census leaves 1.2 KB. Sixth raise. The next component should wait for
// #683 rather than raise this again.
//
// Lowered to 460 KB when `@hozo/metro` began rewriting imports from Hozo's
// barrels to the modules that define each name (`modular-imports.ts`): the
// barrels stopped pulling every pattern in, and Hozo's share fell from
// 590,941 to 436,487 bytes with the census screen still using nearly every
// component. The budget sits just above that, so a regression shows.
//
// Raised to 480 KB after the share crossed 460 at 472,809 in CI (469,125
// locally) without a barrel coming back -- the check below stayed green.
// The room had gone to runtime class states and the patterns resolving
// their class props on Native (#886): 459,880 locally at 79777593, the last
// run that passed. The rest is features since, measured module by module
// against that commit: OTP caret and focus from the real field selection
// (`otp-input.native` and `otp-rules`, +4.6 KB), Button host IDs and typed
// DOM metadata (`button-host-*`, `foundation.native`, +2.1 KB), field-owned
// TextInput focus styles (`text-input-props.native`, +0.9 KB), the class
// resolver's state groups (+0.9 KB) and Stepper's state styles (+0.7 KB).
//
// Lowered to 460 KB when `@hozo/engine` joined `MODULAR_SOURCES`. The
// share had crossed 480 at 480,995 (CI and local agree) by +8.2 KB of
// features against 9fdc6fa7 -- slot facts and decorative-class owners in
// the patterns, `cx` moving into engine, ambient direction in the class
// resolver -- but the cause underneath was a barrel: `@hozo/primitives` and
// `@hozo/typography` import `blendColor` and `HozoTextSizeContext` from
// `@hozo/engine`, whose entry loaded every engine module, the DOM half
// included: 15 modules and 40.8 KB, `responder`, `dom-style`, `interactive`
// and `scrollable` the largest.
// With the import rewritten the share is 440,218.
//
// Raised to 485 KB after the share crossed 460 at 461,600 with #1187, and
// the Pages deploy -- the only job that runs this -- stayed red for a day
// while nothing else noticed. No barrel came back: the share moved in
// steps of 0.2 to 3.9 KB, each a merge that applied @hozo/ui's classes on
// Native at their real owners, read from the deploy logs: 459,508 at
// a6a561bc, the last pass; owner data-presence facts (#1187) 461,600;
// Calendar day and forwarded classes (#1188, #1190) 465,430; the
// date-picker frame and DateTime Done button (#1193, #1194) 469,335;
// TimePicker group and field (#1195) 471,054, value and period (#1196)
// 473,033; data equality facts (#1199) 473,188; portal typography (#1217)
// 473,496. That work (#1205) is not finished, so the room is for it; a
// jump of 15 KB at once is still a barrel, as it was every time before.
//
// Raised to 500 KB after the share crossed 485 and the deploy's last step
// stayed red for a week (the Pages deploy itself still went out). Again no
// barrel, the check below green throughout: 485,414 at 30367124, the first
// run over; 485,370 to 485,325 through #1309, #1314 and #1316; a Dialog scrim blur
// layer and the patterns' Native backdrop adapter (#1320) 488,035; shared
// Tailwind ordering templates in engine (#1324) 489,687.
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
  hozoBytes < 500_000,
  `Hozo's modules stay below 500 KB of the Native dev bundle (were ${hozoBytes} bytes)`,
)

// The cause behind the six raises above, watched directly rather than
// through the number. A barrel that only re-exports reaches the bundle when
// some import of it was not rewritten -- a new package missing from
// `MODULAR_SOURCES`, a name the export table cannot follow, a compiled leaf
// importing the facade -- and from then on every component behind it is
// paid for again. The budget would show that eventually, after enough
// components; this shows it the first time. `@hozo/semantics` still defines
// its components in its entry.
// `@hozo/typography` now keeps its semantic text definitions in a leaf, so
// its facade is watched too: otherwise merely adding CodeLines loads it in
// every app using a heading. `@hozo/engine` is
// listed: its Native entry re-exports the Web one, DOM helpers and all.
const barrels = [...bundle.matchAll(/,"([^"]+)"\);/g)]
  .map((match) => match[1])
  .filter((name) =>
    /(^|[\\/])packages[\\/](core|engine|patterns|primitives|behaviors|form|typography)[\\/]dist[\\/]index(\.native)?\.js$/.test(
      name,
    ),
  )
expect(
  barrels.length === 0,
  `no re-exporting Hozo barrel is in the bundle (found ${barrels.join(', ')})`,
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

console.log(`bundle check passed (${bundle.length} bytes; Hozo modules ${hozoBytes} bytes)`)

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
