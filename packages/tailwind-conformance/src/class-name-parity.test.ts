// Every component that takes `className` in the browser takes it on device.
//
// `className` is the whole authoring surface: the compiler reads it off
// the tag and replaces it with a `StyleSheet` entry, so it exists at
// compile time and never reaches a component. TypeScript still has to
// accept it, because TypeScript reads the source rather than the output.
//
// The Web declarations always did. The native ones never did -- not one of
// them -- and nothing caught it for the whole life of the Native backend,
// because every package published its `react-native` entry point behind an
// export condition with no `types` of its own. `tsc` matched the `types`
// condition first and answered every question about a React Native app out
// of the *Web* declarations. Point it at the right file and
// `examples/native-demo` goes from clean to 54 errors, every one of them
// `className`.
//
// So the invariant that was missing is this one rather than those 54
// lines: the two halves of a component agree about the prop that is the
// reason both halves exist.
//
// It is one `tsc` run over a generated file, and the file names no
// component. A list of names would have to be kept, and a list nobody
// keeps is how the gap opened; a mapped type over the two module
// namespaces asks about whatever is actually exported, so a component
// added tomorrow is in the comparison without anybody adding it.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, globSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = path.dirname(packageRoot)

/**
 * The packages that publish a component under two entry points.
 *
 * Paths rather than package names, and relative to the generated file --
 * which sits one directory inside this package, the same depth as `src`.
 * Resolving `@hozo/core` would answer through the export map, and the
 * export map is the thing under test.
 */
const PAIRS = globSync(path.join(packagesRoot, '*', 'src', 'index.native.{ts,tsx}'))
  .map((native) => {
    const packageName = path.basename(path.dirname(path.dirname(native)))
    const webName = ['index.ts', 'index.tsx'].find((name) =>
      existsSync(path.join(packagesRoot, packageName, 'src', name)),
    )
    if (!webName) return undefined
    return {
      name: `@hozo/${packageName}`,
      // The generated file sits one directory inside this package.
      web: `../../${packageName}/src/${webName}`,
      native: `../../${packageName}/src/${path.basename(native)}`,
    }
  })
  .filter((pair) => pair !== undefined)
  .sort((left, right) => left.name.localeCompare(right.name))

const PREAMBLE = `import type { JSXElementConstructor } from 'react'

// The augmentation that puts \`className\` on React Native's own prop
// interfaces, loaded the way an app loads it -- by importing
// \`@hozo/runtime\`'s native entry, which every native entry here does. By
// path rather than by package name because the export condition that
// chooses that entry is the other half of what this file is guarding, and
// a check should not depend on the thing it checks.
import '../../runtime/src/class-name.native.ts'

type PropsOf<T> = T extends JSXElementConstructor<infer P> ? P : never
type HasClassName<T> = 'className' extends keyof T ? true : false

/** Whether one export is a Web component taking \`className\` that its native twin refuses. */
type Missing<W, N> =
  [PropsOf<W>] extends [never] ? false
  : HasClassName<PropsOf<W>> extends true
    ? ([PropsOf<N>] extends [never] ? true : HasClassName<PropsOf<N>> extends true ? false : true)
    : false

type Shared<W, N> = Extract<keyof W & keyof N, string>

/** The names that fail, as a union -- so the error message is the report. */
type Offenders<W, N> = {
  [K in Shared<W, N>]: Missing<W[K], N[K]> extends true ? K : never
}[Shared<W, N>]

// Each pair is then asserted as
//
//   declare const rN: [Offenders<W, N>] extends [never] ? true : Offenders<W, N> & string
//   export const okN: true = rN
//
// written out at every use rather than put behind an alias of its own,
// and the \`& string\` is the reason. TypeScript prints an alias by name,
// so a bare \`Offenders<W, N>\` reaches the error message as the literal
// text \`Offenders<typeof import(...), typeof import(...)>\`: a component
// somewhere is wrong, without saying which. Resolved in place, the
// message has nothing left to print but the names -- and the message is
// the whole report.

// A control pair. Every assertion below passes when \`Missing\` stops
// discriminating -- a \`keyof\` that answers the same for everything, a
// \`PropsOf\` that resolves to \`any\` because a module failed to resolve --
// and a check that silently compares nothing is the failure this
// repository keeps finding. These two say the machinery still tells a
// present \`className\` from an absent one, in both directions.
type ControlWeb = {
  Kept: (props: { className?: string }) => null
  Dropped: (props: { className?: string }) => null
}
type ControlNative = {
  Kept: (props: { className?: string }) => null
  Dropped: (props: { style?: string }) => null
}
declare const control: [Offenders<ControlWeb, ControlNative>] extends [never]
  ? true
  : Offenders<ControlWeb, ControlNative> & string
export const controlNamesTheOffender: 'Dropped' = control
`

interface Mismatch {
  pair: string
  message: string
}

function checkParity(): Mismatch[] {
  // Inside the package, as `./typecheck.ts` explains at length: `react`
  // and `react-native` have to resolve, and from the OS temp directory
  // they don't -- which makes every type `any` and every assertion pass.
  const dir = mkdtempSync(path.join(packageRoot, '.parity-'))
  try {
    const imports: string[] = []
    const checks: string[] = []
    for (const [index, pair] of PAIRS.entries()) {
      imports.push(`import type * as W${index} from '${pair.web}'`)
      imports.push(`import type * as N${index} from '${pair.native}'`)
      // The package name in a comment, not in the identifier: an error
      // line maps back through it, the way `./typecheck.ts` attributes.
      checks.push(`// ${pair.name}`)
      const offenders = `Offenders<typeof W${index}, typeof N${index}>`
      checks.push(
        `declare const r${index}: [${offenders}] extends [never] ? true : ${offenders} & string`,
      )
      checks.push(`export const ok${index}: true = r${index}`)
    }

    const source = `${imports.join('\n')}\n\n${PREAMBLE}\n${checks.join('\n')}\n`
    writeFileSync(path.join(dir, 'parity.ts'), source)
    writeFileSync(
      path.join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          // React Native's own declarations don't pass `skipLibCheck:
          // false`, and their internal consistency is not the question.
          skipLibCheck: true,
          jsx: 'react-jsx',
          moduleResolution: 'bundler',
          module: 'esnext',
          target: 'esnext',
          lib: ['esnext', 'dom', 'dom.iterable'],
          allowImportingTsExtensions: true,
          types: [],
        },
        files: ['parity.ts'],
      }),
    )

    const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc')
    let output = ''
    try {
      // Untruncated: the error message *is* the report, and TypeScript
      // elides a union past a dozen members -- which is exactly the size
      // this reached when it first ran.
      execFileSync(process.execPath, [tsc, '--project', dir, '--noErrorTruncation'], {
        encoding: 'utf8',
      })
      return []
    } catch (error) {
      // `tsc` exits non-zero when it finds errors, which is what this asks
      // it for rather than a failure to run.
      output = String((error as { stdout?: string }).stdout ?? '')
      if (output === '') throw error
    }

    const lines = source.split('\n')
    const mismatches: Mismatch[] = []
    for (const line of output.split('\n')) {
      const match = /parity\.ts\((\d+),\d+\): error \w+: (.*)$/.exec(line.trim())
      if (!match) continue
      let pair = '(the control, or the file itself)'
      for (let i = Number(match[1]) - 1; i >= 0; i--) {
        const comment = /^\/\/ (@hozo\/\S+)$/.exec(lines[i] ?? '')
        if (comment) {
          pair = comment[1] as string
          break
        }
      }
      mismatches.push({ pair, message: match[2] as string })
    }
    return mismatches
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('the native half of every component accepts className too', () => {
  const mismatches = checkParity()
  assert.deepEqual(
    mismatches.map((entry) => `${entry.pair}: ${entry.message}`),
    [],
  )
})
