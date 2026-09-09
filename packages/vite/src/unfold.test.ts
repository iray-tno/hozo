// Un-folding a module and folding it back gives the module back.
//
// The plugin reads JSX, and an MDX plugin that was not told `jsx: true`
// hands it `_jsx()` calls instead -- `@astrojs/mdx` has no such option to
// be told (#137). So the calls are put back as JSX on the way in and
// folded again on the way out, which this pass was already doing to its
// own output.
//
// That is only sound if the two are inverses, and this is where that is
// established. The fold here is the *same* one the plugin runs at the end
// of its transform -- `transformWithOxc` -- rather than a second opinion
// about what a JSX transform does, so a case that round-trips here
// round-trips in a build.
//
// Written as an equality on the folded form rather than on the JSX,
// because the folded form is what runs. Two spellings of the same JSX are
// not a difference; two different calls are.

import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { transformWithOxc } from 'vite'

const compiler = createCompiler()

const IMPORT = "import { View, Text } from '@hozo/core'\n"

/** What an MDX plugin does to a module, and what the plugin does after it. */
async function fold(code: string, importSource?: string): Promise<string> {
  const out = await transformWithOxc(code, 'page.tsx', {
    jsx: { runtime: 'automatic', ...(importSource ? { importSource } : {}) },
  })
  return out.code
}

/**
 * The one difference a second fold is entitled to, removed.
 *
 * The un-fold leaves the module's `import { jsx as _jsx }` alone -- it has
 * to, because the calls it declined and the calls it never looked at are
 * still using it -- so the fold that follows finds the name taken and
 * introduces `_jsx2` beside it. Two bindings for one function, from one
 * module: the tree built is the same tree, and the second specifier
 * shakes out with the first.
 *
 * Normalised here rather than engineered away in the un-folder. Deleting
 * an import because it *looks* unused is a new way to be wrong, and this
 * is not what the test is about.
 */
function canonical(code: string): string {
  return code
    .split('\n')
    .filter((line) => !/^import \{[^}]*\} from "[^"]*jsx-(dev-)?runtime";$/.test(line))
    .join('\n')
    .replace(/\b(_jsxs|_jsxDEV|_jsx)\d+\b/g, '$1')
}

/**
 * Every shape worth asking about, as the JSX somebody would write.
 *
 * Each is folded to calls, un-folded, and folded again; the two folds have
 * to agree. A case this file cannot round-trip is a case the un-folder has
 * to decline instead, and `foldedPrimitiveCalls` then reports it.
 */
const CASES: Record<string, string> = {
  'a static className': '<View className="p-4 gap-2" />',
  'a nested primitive': '<View className="p-4"><Text className="text-xl">hi</Text></View>',
  'several children': '<View><Text>a</Text><Text>b</Text></View>',
  'text beside an element': '<View>before<Text>a</Text>after</View>',
  'an expression child': '<View>{items.map((item) => item.name)}</View>',
  'a conditional child': '<View>{ready && <Text>a</Text>}</View>',
  'a key': '<View key={row.id} className="p-4" />',
  'a spread, before and after a prop': '<View {...rest} className="p-4" {...more} />',
  'a hyphenated attribute': '<View data-testid="grid" aria-label="grid" />',
  'a component the compiler does not model': '<View className="p-4"><Sidebar wide /></View>',
  'a child that is itself an array': '<View>{[a, b]}</View>',
  'no props at all': '<View />',
}

test('the fold and the un-fold are inverses', async () => {
  for (const [name, jsx] of Object.entries(CASES)) {
    const folded = await fold(`${IMPORT}export const page = ${jsx}\n`)
    const unfolded = compiler.unfoldJsxCalls(folded)
    assert.ok(unfolded, `${name}: nothing was un-folded`)
    const refolded = await fold(unfolded.code, unfolded.importSource)
    assert.equal(canonical(refolded), canonical(folded), name)
  }
})

test('and the comparison is one that can fail', async () => {
  // The test above passes trivially if `fold` stops folding -- a JSX
  // option that stopped applying, a filename oxc reads as plain
  // JavaScript -- because then both sides are the input. A check that
  // silently compares nothing is the failure this repository keeps
  // finding, so this says the fold happened at all.
  const folded = await fold(`${IMPORT}export const page = <View className="p-4" />\n`)
  assert.match(folded, /_jsx\(View/)
  assert.doesNotMatch(folded, /<View/)
})

test('the runtime the calls came from is the runtime they go back to', async () => {
  // Astro's MDX output calls `_jsx` from `astro/jsx-runtime`. Folded back
  // under a project's default the same tree is built by React's runtime,
  // and Astro renders that as the string `[object Object]` -- no error,
  // on a page whose stylesheet came out correct. Measured on
  // `apps/landing` before the un-folder reported this at all.
  const astro = await fold(`${IMPORT}export const page = <View className="p-4" />\n`, 'astro')
  assert.match(astro, /astro\/jsx-runtime/)

  const unfolded = compiler.unfoldJsxCalls(astro)
  assert.ok(unfolded)
  assert.equal(unfolded.importSource, 'astro')
  assert.equal(canonical(await fold(unfolded.code, unfolded.importSource)), canonical(astro))
})

test('what it declines to un-fold it leaves exactly as it found it', async () => {
  // A computed prop name has no JSX spelling. The whole module has to come
  // back untouched rather than half-rewritten -- an un-folder that gave up
  // partway would leave JSX in a file the plugin then hands to a bundler
  // as JavaScript.
  const source = `${IMPORT}export const page = _jsx(View, { [name]: 1 })\n`
  assert.equal(compiler.unfoldJsxCalls(source), undefined)
})

test('a foldable call beside one it declines still gets put back', async () => {
  // Per call, like every other decision the compiler makes per tag. The
  // one it cannot read is not a reason to leave the rest uncompiled.
  const source =
    `${IMPORT}export const a = _jsx(View, { [name]: 1 })\n` +
    `export const b = _jsx(Text, { className: "text-xl" })\n`
  const unfolded = compiler.unfoldJsxCalls(source)
  assert.ok(unfolded)
  assert.match(unfolded.code, /_jsx\(View, \{ \[name\]: 1 \}\)/)
  assert.match(unfolded.code, /<Text className=\{"text-xl"\} \/>/)
})
