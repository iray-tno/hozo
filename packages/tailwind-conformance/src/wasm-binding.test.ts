// The browser binding and the Node one, compiling the same source.
//
// `hozo_napi` and `hozo_wasm` are two doors onto one compiler, and the
// thing that would go wrong is not that either is broken -- it is that
// they stop agreeing. A REPL that says a file compiles while the build
// says it does not is worse than no REPL, because it is believed.
//
// Nothing here re-implements a comparison the compiler could make: both
// sides are asked the same question and the answers are compared whole.
//
// Skipped when `packages/compiler/wasm` is absent, which is what a clone
// looks like before `node scripts/build-wasm.mjs` has run -- it needs the
// `wasm32-unknown-unknown` target and a version-matched `wasm-bindgen`,
// which is more than `pnpm install` provides. CI builds it (see the
// `wasm` job) so the skip is a local convenience and not a hole.

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { compile, compileNative } from '@hozo/compiler'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const built = path.join(root, 'packages', 'compiler', 'wasm', 'nodejs', 'hozo_wasm.js')
const available = existsSync(built)

const wasm = available
  ? (require(built) as {
      compileWeb: (source: string) => string
      compileNative: (source: string) => string
    })
  : null

/** One of each thing the two backends do differently. */
const SOURCES: Record<string, string> = {
  'a styled component': `
    import { View, Text } from '@hozo/core'
    export function Card() {
      return (
        <View className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800 md:p-6">
          <Text className="text-xl font-bold">Title</Text>
        </View>
      )
    }
  `,
  'semantics and typography': `
    import { Main, Heading, Paragraph, Strong, Small } from '@hozo/core'
    export function Page() {
      return (
        <Main>
          <Heading level={2}>Title</Heading>
          <Paragraph>Body <Strong>bold</Strong> <Small>fine print</Small></Paragraph>
        </Main>
      )
    }
  `,
  'a diagnostic': `
    import { Pressable, Text } from '@hozo/core'
    export function Broken() {
      return <Pressable onPress={() => {}}><Text>Go</Text></Pressable>
    }
  `,
  'ruby, which differs on every axis': `
    import { Ruby, RubyText } from '@hozo/core'
    export function Word() {
      return <Ruby>漢字<RubyText>かんじ</RubyText></Ruby>
    }
  `,
}

for (const [name, source] of Object.entries(SOURCES)) {
  test(`the Web output is the same through both bindings: ${name}`, { skip: !available }, () => {
    const node = compile(source)
    const browser = JSON.parse((wasm as NonNullable<typeof wasm>).compileWeb(source)) as {
      jsx: string
      css: string
      runtime_imports: string[]
      diagnostics: { code: string; severity: string; span_start: number; span_end: number }[]
    }[]

    assert.equal(browser.length, node.length, 'a different number of components')
    for (const [at, one] of browser.entries()) {
      const other = node[at]
      assert.equal(one.jsx, other.jsx)
      assert.equal(one.css, other.css)
      assert.deepEqual(one.runtime_imports, other.runtimeImports)
      assert.deepEqual(
        one.diagnostics.map((d) => [d.code, d.severity, d.span_start, d.span_end]),
        other.diagnostics.map((d) => [d.code, d.severity, d.spanStart, d.spanEnd]),
      )
    }
  })

  test(`the Native output is the same through both bindings: ${name}`, { skip: !available }, () => {
    const node = compileNative(source)
    const browser = JSON.parse((wasm as NonNullable<typeof wasm>).compileNative(source)) as {
      jsx: string
      styles: string
      prelude: string[]
      native_imports: string[]
    }[]

    assert.equal(browser.length, node.length)
    for (const [at, one] of browser.entries()) {
      const other = node[at]
      assert.equal(one.jsx, other.jsx)
      assert.equal(one.styles, other.styles)
      assert.deepEqual(one.prelude, other.prelude)
      assert.deepEqual(one.native_imports, other.nativeImports)
    }
  })
}

test('the diagnostic case really produces one', { skip: !available }, () => {
  // Otherwise the comparison above agrees about an empty list, which is
  // agreement about nothing.
  const [component] = compile(SOURCES['a diagnostic'] as string)
  assert.ok(component, 'no component compiled')
  assert.ok(component.diagnostics.length > 0, 'the diagnostic case stopped diagnosing')
})
