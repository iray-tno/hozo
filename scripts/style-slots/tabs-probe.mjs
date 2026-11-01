// Finite evidence fixture, not a production owner contract or resolver.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openCandidateCache } from '../../packages/compiler/src/index.ts'
import { emitFinalTailwindBatch } from '../../packages/compiler/src/tailwind-final-batch.ts'
import { prepareTailwindOrder, tailwindPackageDir } from '../../packages/tailwind/src/theme.ts'

export const tabsProbeRoot = fileURLToPath(new URL('../../', import.meta.url))
export const tabClasses =
  'p-2 bg-[#112233] aria-selected:bg-[#223344] disabled:opacity-50 aria-disabled:border-[3px] hover:rounded-[7px] focus:w-[96px] active:h-[80px] aria-selected:disabled:p-3'
export const tabPhases = [
  'initial',
  'hover-second',
  'focus-second',
  'pressed-second',
  'selected-second',
  'selected-disabled',
]

export async function prepareTabsProbe() {
  const cache = openCandidateCache()
  cache.scanFile('TabsChoices.ts', JSON.stringify(tabClasses.split(' ')), 0)
  const row = { id: 'tabs', revision: 'one', record: cache.exportFile('TabsChoices.ts') }
  const css = '@import "tailwindcss/theme.css";'
  const batch = await emitFinalTailwindBatch({
    expected: [],
    collected: [],
    runtime: { expected: [row], contributions: [row] },
    prepare: async (names) =>
      JSON.stringify((await prepareTailwindOrder(css, tailwindPackageDir(), names)).snapshot),
  })
  const require = createRequire(path.join(tabsProbeRoot, 'examples/storybook-demo/package.json'))
  const { compile } = require('tailwindcss')
  const oracle = await compile(
    `${readFileSync(path.join(tailwindPackageDir(), 'theme.css'), 'utf8')}\n@tailwind utilities;`,
  )
  return {
    classes: tabClasses,
    fingerprint: batch.fingerprint,
    native: batch.native.code,
    candidateCss: cache.renderCss(),
    oracleCss: oracle.build(tabClasses.split(' ')),
  }
}

// Expectations come from the fixture's authored semantics, not a manifest,
// candidate table or inferred fact list. The actual owner receives events.
export function expectedTabRows(phase) {
  const selected = phase === 'selected-disabled' ? 2 : phase === 'selected-second' ? 1 : 0
  const hovered = phase !== 'initial'
  const focused = !['initial', 'hover-second'].includes(phase)
  return [0, 1, 2].map((at) => ({
    selected: at === selected,
    disabled: at === 2,
    padding: at === 2 && at === selected ? 12 : 8,
    background: at === selected ? '#223344' : '#112233',
    opacity: at === 2 ? 0.5 : 1,
    border: at === 2 ? 3 : 0,
    radius: at === 1 && hovered ? 7 : 0,
    width: at === 1 && focused ? 96 : null,
    height: at === 1 && phase === 'pressed-second' ? 80 : null,
  }))
}
