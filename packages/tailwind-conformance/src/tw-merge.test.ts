// Differential test: compares Hozo's compiled `twMerge` / `cn` output against real
// `tailwind-merge` across static, conditional, and runtime-fallback cases (#1676).

import assert from 'node:assert/strict'
import { appendFileSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  createCompiler,
  openCandidateCache,
  type PreparedTailwindContext,
  prepareFinalTailwindContext,
  prepareTailwindContext,
} from '@hozo/compiler'
import { twJoin, twMerge } from 'tailwind-merge'
import { twMerge as legacyMerge } from 'tailwind-merge-legacy'
import { compile as compileTailwind } from 'tailwindcss'

import { findClassHelpers, resolveClassHelpers } from '../../compiler/src/project.ts'
import { TAILWIND_MERGE_CONFIG } from '../../compiler/src/tw-merge-config.ts'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from '../../tailwind/src/theme.ts'

import { ALL_CANDIDATES } from './candidates.ts'

const require = createRequire(import.meta.url)

function createTwMergeCompiler() {
  const compiler = createCompiler(undefined, ['@hozo/core', '@hozo/primitives'])
  compiler.setClassHelpers([
    { module: '@/lib/utils', name: 'cn', merge: true, mergeConfig: TAILWIND_MERGE_CONFIG },
    { module: 'tailwind-merge', name: 'twMerge', merge: true, mergeConfig: TAILWIND_MERGE_CONFIG },
  ])
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

// Execute generated JSX so disappearing predicates and retained calls are
// checked for their observable behavior, including errors and evaluation order.
function render(jsx: string, scope: Record<string, unknown>) {
  const { transformSync } = require('esbuild')
  const { code } = transformSync(`function render() { return (${jsx}) }`, {
    loader: 'jsx',
    jsxFactory: 'h',
  })
  return new Function('h', ...Object.keys(scope), `${code}; return render()`)(
    (_type: unknown, props: unknown) => props,
    ...Object.values(scope),
  )
}

function source(expression: string) {
  return `import { View } from '@hozo/core'
import { cn } from '@/lib/utils'
export const A = () => <View className={${expression}} />`
}

async function compileBothRoutes(
  compiler: ReturnType<typeof createCompiler>,
  input: string,
  context?: PreparedTailwindContext,
) {
  const web = compiler.prepareWebModule(input)
  const native = compiler.prepareNativeModule(input)
  if (!context) {
    const candidates = [...new Set([...web.candidates, ...native.candidates])]
    const { snapshot } = await prepareTailwindOrder(
      '@import "tailwindcss/theme.css";',
      tailwindPackageDir(),
      candidates,
    )
    context = prepareFinalTailwindContext(JSON.stringify(snapshot))
  }
  return [
    compiler.compile(input),
    compiler.compileNative(input),
    web.emit(context),
    native.emit(context).components,
  ]
}

const PADDING_THEME = '@theme { --spacing: 4px; } @tailwind utilities;'
const PADDING_CLASSES = ['ps-8', 'px-2']

test('the compiler keeps the class tokens selected by the resolved merger before CSS ordering', async () => {
  const compiler = createCompiler()
  const direct = (expression: string) =>
    source(expression).replace(
      "import { cn } from '@/lib/utils'",
      "import { twMerge as cn } from 'tailwind-merge'",
    )
  compiler.setClassHelpers(
    await findClassHelpers(direct("cn('ps-8', 'px-2')"), fileURLToPath(import.meta.url), async () =>
      fileURLToPath(import.meta.resolve('tailwind-merge')),
    ),
  )
  const { snapshot } = await prepareTailwindOrder(
    PADDING_THEME,
    tailwindPackageDir(),
    PADDING_CLASSES,
  )
  const context = prepareTailwindContext(JSON.stringify(snapshot))
  for (const classes of [PADDING_CLASSES, [...PADDING_CLASSES].reverse()]) {
    const input = direct(`cn(${classes.map((token) => JSON.stringify(token)).join(', ')})`)
    const [result] = compiler
      .prepareWebModule(input, undefined, { tailwindPlan: true })
      .emit(context)
    assert.doesNotMatch(result.jsx, /\bcn\(/)
    assert.equal(result.tailwindPlan?.mode, 'passthrough')
    const tokens = result.tailwindPlan.sites.flatMap((site) =>
      site.blocks.map((block) => block.candidate),
    )
    assert.deepEqual([...new Set(tokens)], twMerge(...classes).split(' '))
  }
})

async function referencePaddingOrder() {
  const tailwind = await compileTailwind(PADDING_THEME)
  const css = tailwind.build(PADDING_CLASSES)
  assert.match(css, /\.px-2 \{\s*padding-inline: calc\(var\(--spacing\) \* 2\)/)
  assert.match(css, /\.ps-8 \{\s*padding-inline-start: calc\(var\(--spacing\) \* 8\)/)
  return [...css.matchAll(/\.(ps-8|px-2) \{/g)].map((match) => match[1])
}

test('Tailwind CSS orders the two padding rules independently of the authored list order', async () => {
  assert.deepEqual(await referencePaddingOrder(), ['px-2', 'ps-8'])
})

test('ordinary and prepared routes use the resolved merger version through direct calls and wrappers', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-merger-version-'))
  try {
    const app = path.join(root, 'App.tsx')
    const wrapper = path.join(root, 'wrapper.ts')
    const official = fileURLToPath(import.meta.resolve('tailwind-merge'))
    const legacy = require.resolve('tailwind-merge-legacy')
    writeFileSync(
      wrapper,
      `import { twMerge } from 'tailwind-merge'; export const cn = (...args) => twMerge(args)`,
    )
    const direct = source("cn('ps-8', 'px-2')").replace(
      "import { cn } from '@/lib/utils'",
      "import { twMerge as cn } from 'tailwind-merge'",
    )
    const wrapped = source("cn('ps-8', 'px-2')")
    assert.equal(twMerge('ps-8', 'px-2'), 'px-2')
    assert.equal(legacyMerge('ps-8', 'px-2'), 'ps-8 px-2')

    // Read Tailwind's order for the Web sheet and the final Native plan.
    // Ordinary Native uses the compiler's built-in ranks.
    const { snapshot } = await prepareTailwindOrder(
      PADDING_THEME,
      tailwindPackageDir(),
      PADDING_CLASSES,
    )
    const context = prepareFinalTailwindContext(JSON.stringify(snapshot))
    const cache = openCandidateCache()
    cache.scanFile(app, direct, 1)
    const candidateCss = cache.renderCss(undefined, await referencePaddingOrder())
    assert.match(
      candidateCss,
      /\.px-2:where\(\.hozo-candidate-owner\):not\(hozo-none\) \{\s*padding-inline-start: 8px;\s*padding-inline-end: 8px;\s*\}[\s\S]*\.ps-8:where\(\.hozo-candidate-owner\):not\(hozo-none\) \{\s*padding-inline-start: 32px;/,
    )
    const nativeResolvers = [
      cache.renderNativeModule(),
      cache.renderNativeModulePlan(context).code,
    ].map((code) =>
      new Function(
        'createClassResolver',
        `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; return hozoClasses`,
      )(createClassResolver),
    )

    const compiler = createCompiler()
    for (const input of [direct, wrapped]) {
      const dependencies: string[] = []
      const discover = (target: string) =>
        findClassHelpers(
          input,
          app,
          async (specifier, importer) => {
            if (specifier === '@/lib/utils') return wrapper
            assert.equal(specifier, 'tailwind-merge')
            assert.equal(importer, input === direct ? app : wrapper)
            return target
          },
          (file) => dependencies.push(file),
        )
      const entry = input === direct ? official : require.resolve('tailwind-merge')
      const proven = await discover(entry)
      assert.equal(proven[0]?.mergeConfig, TAILWIND_MERGE_CONFIG)
      compiler.setClassHelpers(proven)
      for (const [result] of await compileBothRoutes(compiler, input, context)) {
        assert.doesNotMatch(result.jsx, /\bcn\(/)
        if ('css' in result) {
          assert.match(result.css, /padding-inline-start: 8px/)
          assert.doesNotMatch(result.css, /padding-inline-start: 32px/)
        } else {
          const hozoStyles = new Function(`return (${result.styles})`)()
          const { style } = render(result.jsx, { View: 'View', hozoStyles })
          assert.deepEqual(Object.assign({}, ...[style].flat(Infinity)), {
            paddingStart: 8,
            paddingEnd: 8,
          })
        }
      }
      assert.ok(dependencies.includes(entry))
      if (input === wrapped) assert.ok(dependencies.includes(wrapper))

      const unproven = await discover(legacy)
      assert.equal(unproven[0]?.mergeConfig, undefined)
      // A legacy declaration without rule evidence cannot override discovery.
      const { module, name } = unproven[0]
      compiler.setClassHelpers(resolveClassHelpers([{ module, name }], unproven))
      for (const [route, [result]] of (
        await compileBothRoutes(compiler, input, context)
      ).entries()) {
        const results: string[] = []
        assert.match(result.jsx, /\bcn\(/)
        const props = render(result.jsx, {
          View: 'View',
          hozoStyles: {},
          hozoClasses: nativeResolvers[route < 2 ? 0 : 1],
          cn: (...args: Parameters<typeof legacyMerge>) => {
            const merged = legacyMerge(...args)
            results.push(merged)
            return merged
          },
        })
        assert.deepEqual(results, ['ps-8 px-2'])
        if ('css' in result) {
          assert.match(props.className, /\bhozo-candidate-owner\b/)
          assert.match(props.className, /\bps-8 px-2\b/)
        } else {
          assert.deepEqual(Object.assign({}, ...[props.style].flat(Infinity)), {
            paddingStart: 32,
            paddingEnd: 8,
          })
        }
      }
    }

    const patched = path.join(root, 'merger.mjs')
    copyFileSync(official, patched)
    const discoverPatched = () => findClassHelpers(direct, app, async () => patched)
    assert.equal((await discoverPatched())[0]?.mergeConfig, TAILWIND_MERGE_CONFIG)
    const queried = await findClassHelpers(direct, app, async () => `${patched}?wrapped`)
    assert.equal(queried[0]?.mergeConfig, undefined)
    appendFileSync(patched, '\n// Local patch\n')
    assert.equal((await discoverPatched())[0]?.mergeConfig, undefined)
    compiler.setClassHelpers([{ module: 'tailwind-merge', name: 'twMerge', merge: true }])
    assert.match(compiler.compile(direct)[0].jsx, /\bcn\(/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ordinary and prepared lowering preserve shadowed helper calls and compile the import alias', async () => {
  const compiler = createTwMergeCompiler()
  for (const specifier of ['tailwind-merge', '@/lib/utils']) {
    const imported = specifier === 'tailwind-merge' ? 'twMerge' : 'cn'
    const imports = `import { View } from '@hozo/core'; import { ${imported} as merge } from '${specifier}';`
    const input = `${imports}
      export const Local = (merge) => <View className={merge('p-4', 'p-2')} />
      export const Nested = () => {
        function merge() { return 'p-8' }
        return <View className={merge('p-4', 'p-2')} />
      }
      export const Imported = () => <View className={merge('p-4', 'p-2')} />`
    for (const [local, nested, imported] of await compileBothRoutes(compiler, input)) {
      for (const result of [local, nested]) {
        const calls: string[][] = []
        render(result.jsx, {
          View: 'View',
          hozoStyles: {},
          hozoClasses: (classes: unknown) => classes,
          merge: (...args: string[]) => {
            calls.push(args)
            return 'p-8'
          },
        })
        assert.deepEqual(calls, [['p-4', 'p-2']])
      }
      assert.doesNotMatch(imported.jsx, /\bmerge\(/)
    }
  }
})

test('empty merge branches keep evaluation order, short-circuiting and errors on both routes', async () => {
  const compiler = createTwMergeCompiler()
  const expressions = [
    ["cn(visit(0) ? visit(1) ? '' : '' : '', visit(2) && 'p-2', visit(3) && '')", true],
    ["cn(visit(0) ? visit(1) ? '' : '' : '', visit(2) ? '' : '', visit(3) && '')", true],
    ["cn(visit(0) && (visit(1) ? '' : ''), visit(2) && 'p-2', visit(3) && '')", false],
  ] as const
  for (const [expression, compiled] of expressions) {
    for (const [result] of await compileBothRoutes(compiler, source(expression))) {
      assert.equal(!/\bcn\(/.test(result.jsx), compiled, result.jsx)
      for (const first of [false, true]) {
        const calls: number[] = []
        const visit = (index: number) => {
          calls.push(index)
          return index !== 0 || first
        }
        const scope = {
          View: 'View',
          hozoStyles: {},
          hozoClasses: (classes: unknown) => classes,
          cn: twMerge,
          visit,
        }
        render(result.jsx, scope)
        assert.deepEqual(calls, first ? [0, 1, 2, 3] : [0, 2, 3])
        const failure = new Error('empty class predicate failed')
        calls.length = 0
        assert.throws(
          () =>
            render(result.jsx, {
              ...scope,
              visit: (index: number) => {
                calls.push(index)
                if (index === 3) throw failure
                return first
              },
            }),
          (error) => error === failure,
        )
        assert.deepEqual(calls, first ? [0, 1, 2, 3] : [0, 2, 3])
      }
    }
  }
})

test('same-group conditional merges keep guards small and select the real winning padding', () => {
  const compiler = createTwMergeCompiler()
  const classes = Array.from({ length: 10 }, (_, index) => `p-${index + 1}`)
  const args = classes.map((name, index) => `flags[${index}] && '${name}'`).join(', ')
  const input = source(`cn(${args})`)
  const [web] = compiler.compile(input)
  const [native] = compiler.compileNative(input)
  assert.doesNotMatch(web.jsx, /\bcn\(/)
  assert.doesNotMatch(native.jsx, /\bcn\(/)
  assert.ok(web.jsx.length + web.css.length < 10_000)
  assert.ok(native.jsx.length < 10_000)
  const hozoStyles = new Function(`return (${native.styles})`)()
  for (const active of [[], [0], [0, 3, 6], [1, 9]]) {
    const flags = classes.map((_, index) => active.includes(index))
    const { style } = render(native.jsx, { View: 'View', hozoStyles, flags })
    const merged = twMerge(...classes.filter((_, index) => flags[index]))
    const expected = merged ? 4 * Number(merged.slice(2)) : undefined
    assert.equal(Object.assign({}, ...[style].flat(Infinity)).paddingTop, expected)
  }
})

test('a merge that exceeds the guard expansion budget retains every original evaluation', () => {
  const compiler = createTwMergeCompiler()
  const classes = Array.from({ length: 16 }, (_, index) => `p-${index + 1}`)
  const args = classes.map((name, index) => `choose(${index}) && '${name}'`).join(', ')
  const input = source(`cn(${args})`)
  for (const jsx of [compiler.compile(input)[0].jsx, compiler.compileNative(input)[0].jsx]) {
    assert.match(jsx, /\bcn\(/)
    const evaluations: number[] = []
    const results: string[] = []
    render(jsx, {
      View: 'View',
      hozoClasses: (value: unknown) => value,
      choose: (index: number) => {
        evaluations.push(index)
        return index < 7
      },
      cn: (...values: Parameters<typeof twMerge>) => {
        const result = twMerge(...values)
        results.push(result)
        return result
      },
    })
    assert.deepEqual(
      evaluations,
      classes.map((_, index) => index),
    )
    assert.deepEqual(results, [twMerge(...classes.slice(0, 7))])
  }
})

const mergeCases = [
  ['overflow-x-auto', 'overflow-hidden', 'line-clamp-2'],
  ['touch-pan-x', 'touch-none', 'touch-pan-y'],
  ['ordinal', 'normal-nums', 'slashed-zero'],
  ['shadow-[1px_2px_red]', 'shadow-blue-500'],
  ['shadow-[0.5px_-2px_red]', 'shadow-blue-500'],
  ['text-[日本語]', 'text-red-500'],
  ['text-[LENGTH:12px]', 'text-red-500'],
]

test('multi-token merging and arbitrary validators match the real merger on both backends', () => {
  const compiler = createTwMergeCompiler()
  for (const args of mergeCases) {
    const input = source(`cn(${args.map((arg) => JSON.stringify(arg)).join(',')})`)
    const expected = source(JSON.stringify(twMerge(...args)))
    assert.equal(compiler.compile(input)[0].css, compiler.compile(expected)[0].css, input)
    assert.equal(
      compiler.compileNative(input)[0].styles,
      compiler.compileNative(expected)[0].styles,
      input,
    )
  }
  const nested = source(`cn(cn('overflow-x-auto', 'overflow-hidden'), 'line-clamp-2')`)
  assert.equal(
    compiler.compile(nested)[0].css,
    compiler.compile(
      source(
        JSON.stringify(twMerge(twMerge('overflow-x-auto', 'overflow-hidden'), 'line-clamp-2')),
      ),
    )[0].css,
  )
})

function checkEvaluation(web: string, native: string) {
  for (const jsx of [web, native]) {
    const calls: string[] = []
    const scope = {
      View: 'View',
      hozoStyles: {},
      first: () => {
        calls.push('first')
        return true
      },
      second: () => {
        calls.push('second')
        return false
      },
    }
    render(jsx, scope)
    assert.deepEqual(calls, ['first', 'second'], jsx)
    const failure = new Error('authored predicate failed')
    assert.throws(
      () =>
        render(jsx, {
          ...scope,
          first: () => {
            throw failure
          },
        }),
      (error) => error === failure,
    )
  }
}

const predicateSource = source(`cn(first() && 'p-4', second() && 'p-6', 'p-2')`)

test('eliminating classes preserves predicate side effects, errors, and order on Web and Native', () => {
  const compiler = createTwMergeCompiler()
  checkEvaluation(
    compiler.compile(predicateSource)[0].jsx,
    compiler.compileNative(predicateSource)[0].jsx,
  )
})

test('a root that cannot wrap retains the whole merger and each predicate evaluation', () => {
  const compiler = createTwMergeCompiler()
  const input = predicateSource.replace(
    '<View className',
    '<View accessibilityLabel={before()} className',
  )
  for (const jsx of [compiler.compile(input)[0].jsx, compiler.compileNative(input)[0].jsx]) {
    const calls: string[] = []
    assert.match(jsx, /cn\(/)
    render(jsx, {
      View: 'View',
      hozoStyles: {},
      hozoClasses: (classes: unknown) => classes,
      before: () => {
        calls.push('prop')
        return 'label'
      },
      first: () => {
        calls.push('first')
        return true
      },
      second: () => {
        calls.push('second')
        return false
      },
      cn: twMerge,
    })
    assert.deepEqual(
      calls.filter((call) => call !== 'prop'),
      ['first', 'second'],
      jsx,
    )
    // Cross-prop evaluation ordering is tracked separately in #1879.
    assert.equal(calls.filter((call) => call === 'prop').length, 1, jsx)
  }
})

const opaqueSource = source(`cn('p-4 text-red-500 bg-red-500 overflow-x-auto', className)`)

function checkOpaque(web: string, native: string) {
  for (const jsx of [web, native]) {
    assert.match(jsx, /cn\(/)
    assert.doesNotMatch(jsx, /hozo-conflict-/)
    for (const className of [
      '',
      'p-button',
      'text-[length:12px]',
      'bg-[url(foo.png)]',
      'overflow-hidden line-clamp-2',
    ]) {
      const calls: unknown[][] = []
      render(jsx, {
        View: 'View',
        hozoStyles: {},
        hozoClasses: (classes: unknown) => classes,
        className,
        cn: (...args: string[]) => {
          calls.push(args)
          return twMerge(...args)
        },
      })
      assert.deepEqual(calls, [['p-4 text-red-500 bg-red-500 overflow-x-auto', className]])
    }
  }
}

test('opaque lists keep the real merger for custom classes, arbitrary values, and non-transitive conflicts', () => {
  const compiler = createTwMergeCompiler()
  checkOpaque(compiler.compile(opaqueSource)[0].jsx, compiler.compileNative(opaqueSource)[0].jsx)
})

test('twJoin retains array flattening rather than coercing an opaque array to a comma-separated string', () => {
  const compiler = createTwMergeCompiler()
  const input = source(`twJoin('p-4', caller)`).replace(
    "import { cn } from '@/lib/utils'",
    "import { twJoin } from 'tailwind-merge'",
  )
  const caller = ['px-2', ['font-bold', false, 'text-sm']]
  for (const jsx of [compiler.compile(input)[0].jsx, compiler.compileNative(input)[0].jsx]) {
    const calls: unknown[][] = []
    render(jsx, {
      View: 'View',
      hozoStyles: {},
      hozoClasses: (classes: unknown) => classes,
      caller,
      twJoin: (...args: Parameters<typeof twJoin>) => {
        calls.push(args)
        return twJoin(...args)
      },
    })
    assert.deepEqual(calls, [['p-4', caller]])
  }
  const known = source(`twJoin('p-4', 'px-2')`).replace(
    "import { cn } from '@/lib/utils'",
    "import { twJoin } from 'tailwind-merge'",
  )
  assert.doesNotMatch(compiler.compile(known)[0].jsx, /twJoin\(/)
  assert.equal(
    compiler.compile(known)[0].css,
    compiler.compile(source(JSON.stringify(twJoin('p-4', 'px-2'))))[0].css,
  )
})

test('prepared Web and Native routes preserve the same merge and evaluation boundaries', async () => {
  const compiler = createTwMergeCompiler()
  const inputs = [
    predicateSource,
    opaqueSource,
    ...mergeCases.map((args) => source(`cn(${args.map((arg) => JSON.stringify(arg)).join(',')})`)),
  ]
  const expected = mergeCases.map((args) => source(JSON.stringify(twMerge(...args))))
  const modules = [...inputs, ...expected].map((input) => ({
    web: compiler.prepareWebModule(input),
    native: compiler.prepareNativeModule(input),
  }))
  const candidates = [
    ...new Set(modules.flatMap(({ web, native }) => [...web.candidates, ...native.candidates])),
  ]
  const { snapshot } = await prepareTailwindOrder(
    '@import "tailwindcss/theme.css";',
    tailwindPackageDir(),
    candidates,
  )
  const context = prepareTailwindContext(JSON.stringify(snapshot))
  const results = modules.map(({ web, native }) => ({
    web: web.emit(context)[0],
    native: native.emit(context).components[0],
  }))
  checkEvaluation(results[0].web.jsx, results[0].native.jsx)
  checkOpaque(results[1].web.jsx, results[1].native.jsx)
  mergeCases.forEach((args, index) => {
    const actual = results[index + 2]
    const reference = results[inputs.length + index]
    assert.equal(actual.web.css, reference.web.css, args.join(' '))
    assert.equal(actual.native.styles, reference.native.styles, args.join(' '))
  })
})
