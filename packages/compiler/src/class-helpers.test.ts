// A project's own class-joining function, read as `clsx` is (#964).

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCompiler } from './index.ts'
import { resolveClassHelpers } from './project.ts'
import { DEFAULT_PRIMITIVE_SOURCES } from './sources.ts'

const SHADCN = `import { Pressable } from '@hozo/core'
import { cn } from '@/lib/utils'
export const Item = ({ className }) => (
  <Pressable className={cn('p-4 hover:bg-blue-500', className)} />
)
`

test("a declared helper keeps a component's own state styles on Native", () => {
  const compiler = createCompiler(undefined, [...DEFAULT_PRIMITIVE_SOURCES])
  const before = compiler.compileNative(SHADCN)[0]
  compiler.setClassHelpers(resolveClassHelpers([{ module: '@/lib/utils', name: 'cn' }]))
  const after = compiler.compileNative(SHADCN)[0]
  // Undeclared, the whole call is resolved at runtime, hover included.
  assert.doesNotMatch(before.styles, /hozo0_hover/)
  assert.match(before.jsx, /hozoClasses\(cn\(/)
  // Declared, the literal compiles and only the caller's className is left.
  assert.match(after.styles, /hozo0_hover/)
  assert.match(after.jsx, /hozoClasses\(className, /)
})

test('and on the Web, the literal becomes a scoped rule', () => {
  const compiler = createCompiler(undefined, [...DEFAULT_PRIMITIVE_SOURCES])
  compiler.setClassHelpers([{ module: '@/lib/utils', name: 'cn' }])
  const [web] = compiler.compile(SHADCN)
  assert.match(web.css, /:hover/)
  assert.doesNotMatch(web.jsx, /cn\(/)
})

test('declarations add to what was found, and recognize: false takes one away', () => {
  const found = [
    { module: '@/lib/utils', name: 'cn' },
    { module: './merge', name: 'default' },
  ]
  assert.deepEqual(
    resolveClassHelpers(
      [
        { module: '~/ui', name: 'join' },
        { module: './merge', name: 'default', recognize: false },
      ],
      found,
    ),
    [
      { module: '@/lib/utils', name: 'cn' },
      { module: '~/ui', name: 'join' },
    ],
  )
  assert.deepEqual(resolveClassHelpers(), [])
})

test('a helper is found by following the import to the file it resolves to', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = (await import('node:path')).default
  const { findClassHelpers } = await import('./project.ts')
  const root = mkdtempSync(path.join(tmpdir(), 'hozo-helpers-'))
  try {
    mkdirSync(path.join(root, 'lib'))
    const utils = path.join(root, 'lib', 'utils.ts')
    writeFileSync(
      utils,
      `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
export function format(n: number) { return String(n) }
`,
    )
    const read: string[] = []
    const resolve = async (specifier: string) => (specifier === '@/lib/utils' ? utils : undefined)
    const found = await findClassHelpers(SHADCN, path.join(root, 'Item.tsx'), resolve, (file) =>
      read.push(file),
    )
    assert.deepEqual(found, [{ module: '@/lib/utils', name: 'cn' }])
    assert.deepEqual(read, [utils])

    // Edited into something that is not a pure join, it is no longer one.
    writeFileSync(utils, `import clsx from 'clsx'\nexport const cn = (...c) => clsx('p-2', c)\n`)
    const { utimesSync } = await import('node:fs')
    utimesSync(utils, new Date(), new Date(Date.now() + 5000))
    assert.deepEqual(await findClassHelpers(SHADCN, path.join(root, 'Item.tsx'), resolve), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
