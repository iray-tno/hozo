import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { unlinkSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { createCompiler, openCandidateCache } from '../packages/compiler/src/index.ts'
import { loadTheme } from '../packages/tailwind/src/theme.ts'

// The current addon accepts the old metadata shape too: loading the previous
// adapter reproduces its fallback-based CSS without rebuilding another binary.
const baseline = process.argv[2]
assert.ok(baseline, 'Usage: node scripts/measure-theme-alias.mjs <baseline-commit>')
const root = fileURLToPath(new URL('../', import.meta.url))
const previous = execFileSync('git', ['show', `${baseline}:packages/tailwind/src/theme.ts`], {
  cwd: root,
  encoding: 'utf8',
})
const temporary = new URL(`../packages/tailwind/src/.alias-${randomUUID()}.ts`, import.meta.url)
writeFileSync(temporary, previous, { flag: 'wx' })
try {
  const { loadTheme: loadPrevious } = await import(temporary.href)
  const input = `@import "tailwindcss";
    @theme {
      --color-base: #ff0000;
      --color-alias: var(--color-base);
      --color-chain: var(--color-alias);
      --color-unused: #00ff00;
    }`
  const base = fileURLToPath(new URL('../packages/tailwind/', import.meta.url))
  const names = ['bg-alias', 'bg-alias/50', 'text-chain', 'border-base']
  const source = (i) =>
    `import {View} from '@hozo/core';export const Example${i}=()=> <View className="${names.join(' ')}"/>`
  const measure = async (load) => {
    const theme = await load(input, base)
    const compiler = createCompiler(theme)
    const module = compiler
      .compile(source(0))
      .map((part) => part.css)
      .join('\n')
    const cache = openCandidateCache()
    cache.scanFile('classes.ts', JSON.stringify(names), 1)
    const candidates = cache.renderCss(theme)
    const bundle = Array.from({ length: 24 }, (_, i) =>
      compiler
        .compile(source(i))
        .map((part) => part.css)
        .join('\n'),
    ).join('\n')
    const bytes = (css) => ({ raw: Buffer.byteLength(css), gzip: gzipSync(css).byteLength })
    return {
      native: compiler.compileNative(source(0)),
      sizes: { module: bytes(module), candidates: bytes(candidates), bundle24: bytes(bundle) },
      defaults: (module.match(/ {4}--[\w-]+:/g) ?? []).length,
      unused: module.includes('--color-unused'),
    }
  }
  const before = await measure(loadPrevious)
  const after = await measure(loadTheme)
  assert.deepEqual(after.native, before.native, 'Native output must stay identical')
  assert.equal(after.unused, false)
  console.log(
    JSON.stringify(
      {
        baseline,
        fixture: {
          names,
          modules: 24,
          bundle: 'concatenated per-component CSS before bundler minification',
        },
        before: { sizes: before.sizes, defaults: before.defaults },
        after: { sizes: after.sizes, defaults: after.defaults },
        nativeIdentical: true,
      },
      null,
      2,
    ),
  )
} finally {
  unlinkSync(temporary)
}
