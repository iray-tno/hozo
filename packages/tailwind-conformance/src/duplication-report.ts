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
 * The saving at one corpus size.
 *
 * The candidate stylesheet comes along whatever the size, because it is
 * project-wide: a subset of the modules is still one project.
 */
function at(size: number) {
  const taken = modules.slice(0, size)
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
    size,
    declarations: atoms.declarations,
    distinct: atoms.distinct,
    repeatShare: (atoms.declarations - atoms.distinct) / atoms.declarations,
    cssGzip: [now.gzip, atomic.gzip] as const,
    totalGzip: [now.gzip + jsGzip, atomic.gzip + jsAtomicGzip] as const,
    totalRaw: [now.raw + js, atomic.raw + jsAtomic] as const,
  }
}

console.log(`${modules.length} modules paired with their chunks\n`)
console.log('size  decls  distinct  repeat   stylesheet gzip      app+css gzip        raw')
for (const size of [2, 4, 6, 8, 10, modules.length]) {
  if (size > modules.length) continue
  const r = at(size)
  const delta = (pair: readonly [number, number]) =>
    `${String(pair[0]).padStart(6)}->${String(pair[1]).padStart(6)} ${
      pair[1] < pair[0] ? '-' : '+'
    }${pct(Math.abs(pair[0] - pair[1]), pair[0]).padStart(5)}`
  console.log(
    `${String(r.size).padStart(4)}  ${String(r.declarations).padStart(5)}  ` +
      `${String(r.distinct).padStart(8)}  ${pct(r.repeatShare, 1).padStart(6)}   ` +
      `${delta(r.cssGzip)}   ${delta(r.totalGzip)}   ${delta(r.totalRaw)}`,
  )
}
