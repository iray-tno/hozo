import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import {
  openCandidateCache,
  prepareFinalTailwindContext,
} from '../../../packages/compiler/src/index.ts'
import {
  createClassResolver,
  hozoTextMetricStyles,
} from '../../../packages/engine/src/class-resolver.ts'
import {
  loadTheme,
  prepareTailwindOrder,
  tailwindPackageDir,
} from '../../../packages/tailwind/src/theme.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const sha = (data) => createHash('sha256').update(data).digest('hex')
const facts = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  sources: Object.fromEntries(
    ['crates/hozo_native/src/candidate.rs', 'packages/engine/src/class-resolver.ts'].map((file) => [
      file,
      sha(readFileSync(path.join(root, file))),
    ]),
  ),
  addon: sha(readFileSync(path.join(root, 'packages/compiler/hozo_napi.node'))),
}
const base = tailwindPackageDir()
const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')}\n@tailwind utilities;`
const theme = await loadTheme(css, base)
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const rows = []
for (const count of [18, 130, 1026]) {
  const names = [
    'text-lg',
    'text-xl',
    'leading-6',
    'focus:leading-6',
    'active:text-xl',
    ...Array.from({ length: count - 5 }, (_, i) => `p-${i}`),
  ]
  const prepared = await prepareTailwindOrder(css, base, names)
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 0)
  const code = cache.renderNativeModulePlan(
    prepareFinalTailwindContext(JSON.stringify(prepared.snapshot)),
    theme,
  ).code
  const control = code
    .replace(/^import \{ hozoTextMetricStyles \}.*\n/m, '')
    .replace(/const fontDefaults = new Map\(\[[\s\S]*?\}\)\)\n\n/, '')
    .replace(' compose: resolved => hozoTextMetricStyles(resolved, fontDefaults),', '')
  assert.notEqual(code, control)
  assert.ok(!control.includes('hozoTextMetricStyles'))
  const factory = (text) => () =>
    runInNewContext(
      `${text.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};\nhozoClasses`,
      { createClassResolver, hozoTextMetricStyles },
    )
  const factories = [factory(control), factory(code)]
  const sizes = []
  for (const source of [control, code]) {
    const result = await build({
      stdin: { contents: source, resolveDir: root, loader: 'ts' },
      bundle: true,
      write: false,
      format: 'esm',
      minify: true,
      plugins: [
        {
          name: 'generated-leaf',
          setup(b) {
            b.onResolve({ filter: /^@hozo\/core\/generated\/class-resolver$/ }, () => ({
              path: path.join(root, 'packages/engine/src/generated/class-resolver.ts'),
            }))
          },
        },
      ],
    })
    const buffer = result.outputFiles[0].contents
    sizes.push({ minified: buffer.length, gzip: gzipSync(buffer).length })
  }
  const samples = [[], []]
  for (let sample = 0; sample < 9; sample++)
    for (const route of sample % 2 ? [1, 0] : [0, 1]) {
      const resolve = factories[route]()
      const texts = Array.from(
        { length: 256 },
        (_, i) =>
          `text-lg focus:leading-6 active:text-xl p-${i % (count - 5)} ${' '.repeat(i + 1)}`,
      )
      const start = performance.now()
      for (const text of texts) resolve(text, { focused: true, pressed: true })
      const cold = performance.now() - start
      const text = texts[0]
      const next = performance.now()
      for (let i = 0; i < 10000; i++) resolve(text, { focused: !!(i & 1), pressed: !!(i & 2) })
      const state = performance.now() - next
      const last = performance.now()
      for (let i = 0; i < 10000; i++) resolve('text-lg p-2')
      const hit = performance.now() - last
      samples[route].push({ cold, state, hit })
    }
  rows.push({
    count,
    codeSha256: sha(code),
    context: prepared.snapshot.fingerprint,
    sizes,
    samples,
    medians: samples.map((route) =>
      Object.fromEntries(
        ['cold', 'state', 'hit'].map((key) => [key, median(route.map((s) => s[key]))]),
      ),
    ),
  })
}
console.log(
  JSON.stringify(
    {
      kind: 'current metric composition ablation, not a previous-release or whole-app benchmark',
      facts,
      node: process.version,
      coldStrings: 256,
      stateCalls: 10000,
      hitCalls: 10000,
      rows,
    },
    null,
    2,
  ),
)
