import assert from 'node:assert/strict'
import { test } from 'node:test'

import { auditArbitraryNative, findUnresolvableInNativeOutput } from './arbitrary-native-audit.ts'
import { compareNativeCandidate } from './native.ts'
import { buildOracle } from './oracle.ts'
import { loadThemeVars } from './theme.ts'

test('findUnresolvableInNativeOutput flags unresolvable strings while admitting folded values', () => {
  assert.equal(
    findUnresolvableInNativeOutput("{ hozo0: { width: 32, height: '50%' } }", ''),
    undefined,
  )
  assert.equal(findUnresolvableInNativeOutput('{ hozo0: { lineHeight: 27 } }', ''), undefined)
  assert.equal(
    findUnresolvableInNativeOutput("{ hozo0: { backgroundColor: '#ff0000' } }", ''),
    undefined,
  )
  assert.equal(findUnresolvableInNativeOutput("{ hozo0: { filter: 'blur(10px)' } }", ''), undefined)
  assert.equal(
    findUnresolvableInNativeOutput("{ hozo0: { filter: 'brightness(50%)' } }", ''),
    undefined,
  )

  assert.match(
    findUnresolvableInNativeOutput("{ hozo0: { backgroundColor: 'var(--x)' } }", '') ?? '',
    /var\(\)/,
  )
  assert.match(
    findUnresolvableInNativeOutput("{ hozo0: { borderColor: '50%' } }", '') ?? '',
    /invalid RN color/,
  )
  assert.match(
    findUnresolvableInNativeOutput("{ hozo0: { filter: 'blur(#ff0000)' } }", '') ?? '',
    /invalid RN filter/,
  )
  assert.match(
    findUnresolvableInNativeOutput("{ hozo0: { filter: 'blur(2rem)' } }", '') ?? '',
    /invalid RN filter/,
  )
  assert.match(
    findUnresolvableInNativeOutput("{ hozo0: { transform: [{ translateX: 'auto' }] } }", '') ?? '',
    /translateX: 'auto'/,
  )
  assert.match(
    findUnresolvableInNativeOutput("{ hozo0: { borderEndWidth: '50%' } }", '') ?? '',
    /non-numeric RN borderWidth/,
  )
  assert.match(
    findUnresolvableInNativeOutput("{ hozo0: { maxWidth: 'auto' } }", '') ?? '',
    /maxWidth: 'auto'/,
  )
  assert.match(
    findUnresolvableInNativeOutput('', "<TextInput cursorColor={'10px'} />") ?? '',
    /invalid RN color prop/,
  )
  assert.match(
    findUnresolvableInNativeOutput('', '<TextInput placeholderTextColor="nonsense" />') ?? '',
    /nonsense/,
  )
})

test('auditArbitraryNative partitions representative arbitrary candidates honestly across buckets', async () => {
  const sample = [
    // Valid covered (including folded `leading-[1.5em]` against `text-lg`, `w-[100vh]`, and `blur-[2rem]` -> `blur(32px)`)
    'w-[10px]',
    'bg-[#ff0000]',
    'leading-[1.5em]',
    'w-[100vh]',
    'blur-[2rem]',
    // Formerly false-positive COVERED entries, now refused at compile time
    'bg-[var(--x)]',
    'border-[50%]',
    'blur-[#ff0000]',
    'caret-[10px]',
    'translate-x-[auto]',
    // Context covered (works inside HozoGrid / <Svg>)
    'grid-cols-[10px]',
    'grid-cols-[2rem]',
    'grid-cols-[calc(100%-2rem)]',
    'fill-[#ff0000]',
    'stroke-[1.5]',
    'stroke-[2rem]',
    // Zero-cost RN 0.87.1 arbitrary values (Phase 2 completed)
    'rounded-[50%]',
    'p-[50%]',
    'gap-[50%]',
    'scale-[1.5]',
    'translate-[10px]',
    'aspect-[1.5]',
    'flex-[1.5]',
    'flex-[auto]',
    'opacity-[50%]',
    'align-[auto]',
    'cursor-[auto]',
    'backdrop-blur-[2rem]',
    'ring-offset-[10px]',
    '[color:red]',
    // Self-sized %-mixed calc() (Phase 3 Slice 3.1: HozoSelfMeasured)
    'translate-x-[calc(100%-2rem)]',
    'rounded-[calc(100%-2rem)]',
    'gap-[calc(100%-2rem)]',
    // Layout measurable (parent-relative %-mixed calc() pending Slice 3.2)
    'w-[calc(100%-2rem)]',
    'p-[calc(100%-2rem)]',
    // Dynamic CSS (out-of-scope runtime state)
    'w-[var(--x)]',
    'w-[1.5em]',
    'rounded-[100vh]',
    'text-[50%]',
    'text-[calc(100%-2rem)]',
    // Web-only
    'columns-[10px]',
    'animate-[10px]',
    'bg-conic-[10px]',
    'scale-z-[1.5]',
    'perspective-[10px]',
    '[&>*]:p-4',
    '[--my-var:4px]',
    // Invalid CSS from synthetic cross-product
    'w-[#ff0000]',
    'z-[10px]',
    'rounded-[nonsense]',
    'rotate-[10px]',
    'border-[calc(100%-2rem)]',
  ]

  const oracle = await buildOracle(sample)
  const vars = new Map([...loadThemeVars(), ...oracle.registerDefaults])
  const nativeResults = sample.map(compareNativeCandidate)
  const { entries, summary } = auditArbitraryNative(nativeResults, oracle.rules, vars)

  const byCandidate = new Map(entries.map((entry) => [entry.candidate, entry.bucket]))

  assert.equal(byCandidate.get('w-[10px]'), 'validCovered')
  assert.equal(byCandidate.get('bg-[#ff0000]'), 'validCovered')
  assert.equal(byCandidate.get('leading-[1.5em]'), 'validCovered')
  assert.equal(byCandidate.get('w-[100vh]'), 'validCovered')
  assert.equal(byCandidate.get('blur-[2rem]'), 'validCovered')

  assert.equal(byCandidate.get('bg-[var(--x)]'), 'dynamicCss')
  assert.equal(byCandidate.get('border-[50%]'), 'invalidCss')
  assert.equal(byCandidate.get('blur-[#ff0000]'), 'invalidCss')
  assert.equal(byCandidate.get('caret-[10px]'), 'invalidCss')
  assert.equal(byCandidate.get('translate-x-[auto]'), 'invalidCss')
  assert.equal(summary.unresolvableCovered, 0)

  assert.equal(byCandidate.get('grid-cols-[10px]'), 'contextCovered')
  assert.equal(byCandidate.get('grid-cols-[2rem]'), 'contextCovered')
  assert.equal(byCandidate.get('grid-cols-[calc(100%-2rem)]'), 'contextCovered')
  assert.equal(byCandidate.get('fill-[#ff0000]'), 'contextCovered')
  assert.equal(byCandidate.get('stroke-[1.5]'), 'contextCovered')
  assert.equal(byCandidate.get('stroke-[2rem]'), 'contextCovered')

  assert.equal(byCandidate.get('rounded-[50%]'), 'validCovered')
  assert.equal(byCandidate.get('p-[50%]'), 'validCovered')
  assert.equal(byCandidate.get('gap-[50%]'), 'validCovered')
  assert.equal(byCandidate.get('scale-[1.5]'), 'validCovered')
  assert.equal(byCandidate.get('translate-[10px]'), 'validCovered')
  assert.equal(byCandidate.get('aspect-[1.5]'), 'validCovered')
  assert.equal(byCandidate.get('flex-[1.5]'), 'validCovered')
  assert.equal(byCandidate.get('flex-[auto]'), 'validCovered')
  assert.equal(byCandidate.get('opacity-[50%]'), 'validCovered')
  assert.equal(byCandidate.get('align-[auto]'), 'validCovered')
  assert.equal(byCandidate.get('cursor-[auto]'), 'validCovered')
  assert.equal(byCandidate.get('backdrop-blur-[2rem]'), 'validCovered')
  assert.equal(byCandidate.get('ring-offset-[10px]'), 'validCovered')
  assert.equal(byCandidate.get('[color:red]'), 'validCovered')
  assert.equal(byCandidate.get('translate-x-[calc(100%-2rem)]'), 'validCovered')
  assert.equal(byCandidate.get('rounded-[calc(100%-2rem)]'), 'validCovered')
  assert.equal(byCandidate.get('gap-[calc(100%-2rem)]'), 'validCovered')
  assert.equal(summary.implementable, 0)

  assert.equal(byCandidate.get('w-[calc(100%-2rem)]'), 'layoutMeasurable')
  assert.equal(byCandidate.get('p-[calc(100%-2rem)]'), 'layoutMeasurable')

  assert.equal(byCandidate.get('w-[var(--x)]'), 'dynamicCss')
  assert.equal(byCandidate.get('w-[1.5em]'), 'dynamicCss')
  assert.equal(byCandidate.get('rounded-[100vh]'), 'dynamicCss')
  assert.equal(byCandidate.get('text-[50%]'), 'dynamicCss')
  assert.equal(byCandidate.get('text-[calc(100%-2rem)]'), 'dynamicCss')

  assert.equal(byCandidate.get('columns-[10px]'), 'webOnly')
  assert.equal(byCandidate.get('animate-[10px]'), 'webOnly')
  assert.equal(byCandidate.get('bg-conic-[10px]'), 'webOnly')
  assert.equal(byCandidate.get('scale-z-[1.5]'), 'webOnly')
  assert.equal(byCandidate.get('perspective-[10px]'), 'webOnly')
  assert.equal(byCandidate.get('[&>*]:p-4'), 'webOnly')
  assert.equal(byCandidate.get('[--my-var:4px]'), 'webOnly')

  assert.equal(byCandidate.get('w-[#ff0000]'), 'invalidCss')
  assert.equal(byCandidate.get('z-[10px]'), 'invalidCss')
  assert.equal(byCandidate.get('rounded-[nonsense]'), 'invalidCss')
  assert.equal(byCandidate.get('rotate-[10px]'), 'invalidCss')
  assert.equal(byCandidate.get('border-[calc(100%-2rem)]'), 'invalidCss')

  // Partition invariant: every candidate lands in exactly one bucket.
  const total =
    summary.validCovered +
    summary.unresolvableCovered +
    summary.contextCovered +
    summary.implementable +
    summary.layoutMeasurable +
    summary.dynamicCss +
    summary.webOnly +
    summary.invalidCss +
    summary.noOp +
    summary.silent
  assert.equal(total, sample.length)
  assert.equal(summary.silent, 0)
})
