import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { atomise, substituteClasses } from './duplication.ts'

const demo = path.resolve('../../examples/storybook-demo')
const assets = path.join(demo, 'storybook-static', 'assets')

/** A module's companion stylesheet paired with the chunk it compiled into. */
interface Module {
  name: string
  css: string
  js: string
}

const modules: Module[] = []
for (const file of readdirSync(path.join(demo, 'src')).filter((f) => f.endsWith('.hozo.css'))) {
  const name = file.replace('.tsx.hozo.css', '')
  const chunk = readdirSync(assets).find((f) => f.startsWith(`${name}-`) && f.endsWith('.js'))
  if (!chunk) continue
  modules.push({
    name,
    css: readFileSync(path.join(demo, 'src', file), 'utf8'),
    js: readFileSync(path.join(assets, chunk), 'utf8'),
  })
}

const candidatesPath = path.join(demo, 'node_modules', '.hozo', 'candidates.css')
const candidates = existsSync(candidatesPath) ? readFileSync(candidatesPath, 'utf8') : ''

const weigh = (text: string) => ({
  raw: Buffer.byteLength(text),
  gzip: gzipSync(text).length,
  brotli: brotliCompressSync(text).length,
})
const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1)}%`

/**
 * Chunks that are a library rather than a page, by the only test that matters
 * here: how much of the bundle has nothing to do with Hozo.
 *
 * `ThreeR3F.stories` is 857 KB raw and 228 KB gzipped -- three.js and React
 * Three Fiber -- and it holds six `className`s. Left in the denominator it
 * decides the answer: the app+css saving reads −1.1% at 23 modules, and what
 * that number is mostly about is the size of three.js.
 *
 * This did not exist when #4 was measured; the Three work arrived later. So the
 * report gives both denominators rather than choosing one, and says which is
 * which. Excluding it is not flattering atomic -- the excluded chunk is the one
 * atomic cannot help, because it has no class names to shorten or lengthen.
 */
const LIBRARY_CHUNKS = ['ThreeR3F.stories']

/**
 * The saving at one corpus size.
 *
 * The candidate stylesheet comes along whatever the size, because it is
 * project-wide: a subset of the modules is still one project. That constant
 * term used to be small and is not any more -- `@hozo/ui`'s class lists reach
 * the output through it, because they are props rather than tags the compiler
 * lowers -- which is why the `size` column means less than it did: even two
 * modules now carry the whole library's stylesheet.
 */
function at(size: number, { excludeLibraries = false } = {}) {
  const taken = modules
    .filter((m) => !(excludeLibraries && LIBRARY_CHUNKS.includes(m.name)))
    .slice(0, size)
  const css = taken.map((m) => m.css).join('\n') + candidates
  const atoms = atomise(css)

  let js = 0
  let jsAtomic = 0
  let jsGzip = 0
  let jsAtomicGzip = 0
  for (const module of taken) {
    const rewritten = module.js.replace(/className:\s*(["`])([^"`]*)\1/g, (whole, quote, value) =>
      /hozo-/.test(value)
        ? `className:${quote}${substituteClasses(value, atoms.atomsFor)}${quote}`
        : whole,
    )
    js += Buffer.byteLength(module.js)
    jsAtomic += Buffer.byteLength(rewritten)
    jsGzip += gzipSync(module.js).length
    jsAtomicGzip += gzipSync(rewritten).length
  }

  const now = weigh(css)
  const atomic = weigh(atoms.css)
  return {
    size: taken.length,
    declarations: atoms.declarations,
    distinct: atoms.distinct,
    repeatShare: (atoms.declarations - atoms.distinct) / atoms.declarations,
    cssGzip: [now.gzip, atomic.gzip] as const,
    totalGzip: [now.gzip + jsGzip, atomic.gzip + jsAtomicGzip] as const,
    totalRaw: [now.raw + js, atomic.raw + jsAtomic] as const,
    // The two halves of the trade in bytes, which no denominator can tilt: the
    // stylesheet shrinks by one and every element's class attribute grows by
    // the other. A percentage of "the app" is only as meaningful as the app.
    cssSaved: now.gzip - atomic.gzip,
    jsCost: jsAtomicGzip - jsGzip,
  }
}

const delta = (pair: readonly [number, number]) =>
  `${String(pair[0]).padStart(6)}->${String(pair[1]).padStart(6)} ${
    pair[1] < pair[0] ? '-' : '+'
  }${pct(Math.abs(pair[0] - pair[1]), pair[0]).padStart(5)}`

const signed = (n: number) => `${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(5)}`

function table(label: string, options: { excludeLibraries?: boolean } = {}) {
  const total = modules.filter(
    (m) => !(options.excludeLibraries && LIBRARY_CHUNKS.includes(m.name)),
  ).length
  console.log(`\n${label} (${total} modules)\n`)
  console.log(
    'size  decls  distinct  repeat   stylesheet gzip      app+css gzip        raw' +
      '              css    js    net',
  )
  for (const size of [2, 4, 6, 8, 10, total]) {
    if (size > total) continue
    const r = at(size, options)
    console.log(
      `${String(r.size).padStart(4)}  ${String(r.declarations).padStart(5)}  ` +
        `${String(r.distinct).padStart(8)}  ${pct(r.repeatShare, 1).padStart(6)}   ` +
        `${delta(r.cssGzip)}   ${delta(r.totalGzip)}   ${delta(r.totalRaw)}   ` +
        `${signed(-r.cssSaved)} ${signed(r.jsCost)} ${signed(r.jsCost - r.cssSaved)}`,
    )
  }
}

console.log(`${modules.length} modules paired with their chunks`)
table('Every chunk, which is what a visitor downloads')
table('Without the library chunks, which have no class names to shorten', {
  excludeLibraries: true,
})

/**
 * The same question asked of each path a class reaches the output by, which is
 * where the answer turns out to live.
 *
 * A `className` the compiler reads statically becomes a self-contained rule per
 * element in that module's companion sheet -- the precise path, and the one
 * atomic output is a proposal about. A class it cannot resolve becomes one
 * shared rule in the project-wide candidate sheet, named after the class
 * itself: **that path is already atomic**, one declaration group per utility,
 * reused by every element that names it.
 *
 * `@hozo/ui` is almost entirely on the second path, because its class lists are
 * props passed to another component rather than attributes on a tag the
 * compiler lowers. So the styled library -- the corpus #638 §3 expected to make
 * the case for atomic -- mostly demonstrates the case being already answered
 * where it sits.
 */
{
  const companion = modules.map((m) => m.css).join('\n')
  console.log('\nBy the path the class took\n')
  console.log('path                              decls  distinct  repeat   stylesheet gzip')
  for (const [label, css] of [
    ['companion sheets (lowered tags)', companion],
    ['candidate sheet (runtime classes)', candidates],
  ] as const) {
    if (css.length === 0) continue
    const atoms = atomise(css)
    console.log(
      `${label.padEnd(33)} ${String(atoms.declarations).padStart(5)}  ` +
        `${String(atoms.distinct).padStart(8)}  ` +
        `${pct((atoms.declarations - atoms.distinct) / atoms.declarations, 1).padStart(6)}   ` +
        `${delta([weigh(css).gzip, weigh(atoms.css).gzip])}`,
    )
  }
}
