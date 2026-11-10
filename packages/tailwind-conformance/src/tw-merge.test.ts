// Differential test: compares Hozo's compiled `twMerge` / `cn` output against real
// `tailwind-merge` across static, conditional, and runtime-fallback cases (#1676).

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import zlib from 'node:zlib'

import { createCompiler } from '@hozo/compiler'
import { twMerge } from 'tailwind-merge'

import { ALL_CANDIDATES } from './candidates.ts'

const require = createRequire(import.meta.url)

function createTwMergeCompiler() {
  const compiler = createCompiler(undefined, ['@hozo/core', '@hozo/primitives'])
  compiler.setClassHelpers([{ module: '@/lib/utils', name: 'cn', merge: true }])
  return compiler
}

const STATIC_CONFLICT_PAIRS: Array<[string, string]> = [
  // Exact group conflicts
  ['px-3', 'px-2'],
  ['py-1', 'py-4'],
  ['bg-blue-500', 'bg-red-500'],
  ['text-sm', 'text-lg'],
  ['text-red-500', 'text-blue-600'],
  ['font-bold', 'font-medium'],
  ['uppercase', 'lowercase'],
  ['flex', 'block'],
  ['grid', 'inline-flex'],
  ['relative', 'absolute'],
  ['overflow-hidden', 'overflow-scroll'],
  ['justify-start', 'justify-between'],
  ['items-center', 'items-end'],
  // Non-conflicting pairs across ambiguous prefixes (`text-*`, `border-*`, `bg-*`)
  ['text-lg', 'text-red-500'],
  ['text-red-500', 'text-lg'],
  ['text-center', 'text-lg'],
  ['border-2', 'border-red-500'],
  ['border-red-500', 'border-2'],
  ['border-solid', 'border-2'],
  // Shorthand vs longhand (shorthand after longhand drops longhand; longhand after shorthand keeps both)
  ['px-2', 'p-4'],
  ['p-4', 'px-2'],
  ['pt-2 pb-4', 'py-6'],
  ['py-6', 'pt-2'],
  ['mx-2 my-4', 'm-0'],
  ['m-0', 'mx-2'],
  ['top-2 left-4', 'inset-0'],
  ['inset-0', 'top-2'],
  ['left-2 right-2', 'inset-x-4'],
  ['inset-x-4', 'left-2'],
  ['rounded-t-lg', 'rounded-none'],
  ['rounded-lg', 'rounded-t-none'],
  ['rounded-tl-md', 'rounded-t-lg'],
  ['border-t-2', 'border-4'],
  ['border-4', 'border-t-2'],
  ['border-x-2', 'border-4'],
  ['border-t-red-500', 'border-blue-500'],
  ['border-blue-500', 'border-t-red-500'],
  ['gap-x-2 gap-y-4', 'gap-6'],
  ['gap-6', 'gap-x-2'],
  ['overflow-x-auto', 'overflow-hidden'],
  ['overflow-hidden', 'overflow-x-auto'],
  ['scale-x-50', 'scale-100'],
  ['scale-100', 'scale-x-50'],
  // Postfix modifier conflicts: `font-size` with `/line-height` overrides `leading`
  ['leading-6', 'text-lg/8'],
  ['text-lg/8', 'leading-6'],
  ['text-lg', 'leading-6'],
  // Modifiers & modifier ordering
  ['hover:bg-blue-500', 'hover:bg-red-500'],
  ['hover:bg-blue-500', 'focus:bg-red-500'],
  ['hover:bg-blue-500', 'bg-red-500'],
  ['bg-blue-500', 'hover:bg-red-500'],
  ['hover:focus:bg-blue-500', 'focus:hover:bg-red-500'],
  ['md:hover:p-4', 'hover:md:px-2'],
  ['dark:hover:text-white', 'hover:dark:text-black'],
  // Important modifier
  ['!p-4', '!px-2'],
  ['!px-2', '!p-4'],
  ['p-4!', 'px-2!'],
  // Arbitrary values & arbitrary properties
  ['p-[10px]', 'p-[20px]'],
  ['bg-[#111]', 'bg-[#222]'],
  ['[color:red]', '[color:blue]'],
  ['[color:red]', '[background:blue]'],
  ['hover:[color:red]', 'hover:[color:blue]'],
]

test('Part 1: static twMerge(a, b) matches compiling real twMerge(a, b) with 0 mismatches', () => {
  const compiler = createTwMergeCompiler()
  const mismatches: string[] = []

  // Also sample deterministic pairs across ALL_CANDIDATES
  const candidateSample = ALL_CANDIDATES.filter((_, i) => i % 29 === 0)
  const pairs: Array<[string, string]> = [...STATIC_CONFLICT_PAIRS]
  for (let i = 0; i < candidateSample.length - 1; i++) {
    pairs.push([candidateSample[i].raw, candidateSample[i + 1].raw])
    // Same candidate twice (always conflicts with itself if recognized)
    pairs.push([candidateSample[i].raw, candidateSample[i].raw])
  }

  for (const [a, b] of pairs) {
    const expectedMerged = twMerge(a, b)
    const [compiledMerge] = compiler.compile(`
      import { View } from '@hozo/core'
      import { cn } from '@/lib/utils'
      export const A = () => <View className={cn(${JSON.stringify(a)}, ${JSON.stringify(b)})} />
    `)
    const [compiledLiteral] = compiler.compile(`
      import { View } from '@hozo/core'
      export const A = () => <View className=${JSON.stringify(expectedMerged)} />
    `)
    if (compiledMerge.css !== compiledLiteral.css) {
      mismatches.push(
        `pair (${a}, ${b}) -> twMerge=${JSON.stringify(expectedMerged)}\n  compiled: ${compiledMerge.css}\n  expected: ${compiledLiteral.css}`,
      )
    }
  }

  assert.equal(
    mismatches.length,
    0,
    `Expected 0 mismatches across ${pairs.length} pairs:\n${mismatches.slice(0, 10).join('\n')}`,
  )
})

test('Part 1: conditional cn(a, cond && b) negates overridden earlier utilities on Web and Native', () => {
  const compiler = createTwMergeCompiler()
  const src = `
    import { Pressable } from '@hozo/core'
    import { cn } from '@/lib/utils'
    export const Btn = ({ active }: { active: boolean }) => (
      <Pressable className={cn('px-3 py-1 hover:bg-blue-500', active && 'px-2')} />
    )
  `
  const [web] = compiler.compile(src)
  // `py-1` and `hover:bg-blue-500` are untouched; `px-3` is guarded by `:not(:where(.hozo-cond-...))` on Web
  // and `!(...)` on Native.
  assert.doesNotMatch(web.jsx, /\bcn\(/)
  assert.match(web.css, /:not\(:where\(\.hozo-cond-/)
  assert.match(web.css, /padding-inline-start:\s*12px/)
  assert.match(web.css, /padding-inline-start:\s*8px/)

  const [native] = compiler.compileNative(src)
  assert.doesNotMatch(native.jsx, /\bcn\(/)
  assert.match(native.jsx, /!\(__hozoClassPlan/)
  assert.match(native.styles, /hozo0_hover/)
})

test('Part 2: cn(staticBase, className) emits per-group conflict guards and matches twMerge(base, caller) with 0 mismatches', () => {
  const compiler = createTwMergeCompiler()
  const base = 'px-3 py-1 uppercase text-sm hover:bg-blue-500 active:opacity-80'
  const src = `
    import { Pressable } from '@hozo/core'
    import { cn } from '@/lib/utils'
    export const Button = ({ className }: { className?: string }) => (
      <Pressable className={cn('${base}', className)} />
    )
  `
  const [web] = compiler.compile(src)
  const [native] = compiler.compileNative(src)

  // Both Web and Native eliminate the runtime `cn(...)` call and keep hover/active states.
  assert.doesNotMatch(web.jsx, /\bcn\(/)
  assert.doesNotMatch(native.jsx, /\bcn\(/)
  assert.match(native.styles, /hozo0_hover_cond_/)
  assert.match(native.styles, /hozo0_pressed_cond_/)

  // Extract every generated conflict test `/.../....test(className ?? "")` from the compiled JSX
  // and verify that for a comprehensive list of caller `className` inputs, each base token's
  // survival matches `twMerge(base, caller)`.
  const baseTokens = base.split(' ')
  const callerInputs = [
    '',
    'px-2',
    'p-4',
    'pl-6',
    'py-2',
    'pt-4',
    'm-2',
    'lowercase',
    'capitalize',
    'normal-case',
    'text-lg',
    'text-red-500',
    'hover:bg-red-500',
    'bg-red-500',
    'focus:bg-red-500',
    'active:opacity-50',
    'opacity-50',
    'px-2 lowercase hover:bg-emerald-600',
    'p-0 normal-case text-xl active:opacity-100',
  ]

  // Check each individual single-token base to verify its exact generated regex against `twMerge`.
  const mismatches: string[] = []
  for (const token of baseTokens) {
    const [singleWeb] = compiler.compile(`
      import { Pressable } from '@hozo/core'
      import { cn } from '@/lib/utils'
      export const B = ({ className }: { className?: string }) => (
        <Pressable className={cn('${token}', className)} />
      )
    `)
    const match = singleWeb.jsx.match(/(\/\(\?:[\s\S]*?\/)\.test\(\(className\)\)/)
    assert.ok(match, `expected conflict regex for ${token} in ${singleWeb.jsx}`)
    // Evaluate the regex literal
    const regex = new Function(`return ${match[1]}`)() as RegExp

    for (const caller of callerInputs) {
      const merged = twMerge(token, caller)
      const expectedDropped = !merged.split(/\s+/).includes(token)
      const actualDropped = regex.test(caller)
      if (actualDropped !== expectedDropped) {
        mismatches.push(
          `base=${token} caller=${JSON.stringify(caller)}: regex.test=${actualDropped}, twMerge=${JSON.stringify(merged)} (expectedDropped=${expectedDropped})`,
        )
      }
    }
  }

  assert.equal(mismatches.length, 0, `Expected 0 mismatches:\n${mismatches.join('\n')}`)
})

test('Bundle size measurement: compiled conflict checks are a tiny fraction of shipping tailwind-merge (~8 KB gzip)', () => {
  const compiler = createTwMergeCompiler()
  const [web] = compiler.compile(`
    import { Pressable } from '@hozo/core'
    import { cn } from '@/lib/utils'
    export const Button = ({ className }: { className?: string }) => (
      <Pressable className={cn('px-3 py-1 uppercase hover:bg-blue-500', className)} />
    )
  `)

  // Measure the generated conflict check snippet vs the tailwind-merge bundle
  const twMergeBundlePath = require.resolve('tailwind-merge')
  const twMergeRaw = fs.readFileSync(twMergeBundlePath)
  const twMergeGzip = zlib.gzipSync(twMergeRaw)

  const checkRaw = Buffer.from(web.jsx, 'utf8')
  const checkGzip = zlib.gzipSync(checkRaw)

  // `tailwind-merge` is ~24 KB minified / ~7-8 KB gzipped; the compiled component is a few hundred bytes.
  assert.ok(
    twMergeGzip.byteLength > 6000,
    `expected tailwind-merge gzip (${twMergeGzip.byteLength} B) > 6000 B`,
  )
  assert.ok(
    checkGzip.byteLength < 600,
    `expected compiled component JSX gzip (${checkGzip.byteLength} B) < 600 B`,
  )
})
