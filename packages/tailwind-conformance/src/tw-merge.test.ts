// Differential test: compares Hozo's compiled `twMerge` / `cn` output against real
// `tailwind-merge` across static, conditional, and runtime-fallback cases (#1676).

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { createCompiler, prepareTailwindContext } from '@hozo/compiler'
import { twJoin, twMerge } from 'tailwind-merge'

import { prepareTailwindOrder, tailwindPackageDir } from '../../tailwind/src/theme.ts'

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
