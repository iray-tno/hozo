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
