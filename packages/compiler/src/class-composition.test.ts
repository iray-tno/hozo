// Code/evaluation evidence, not DOM cascade or Native glyph certification.
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: These fixtures retain executable authored TSX interpolation.
import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { createCompiler } from './index.ts'

const compiler = createCompiler()
function evaluate(jsx: string, context: Record<string, unknown>, styles = '{}') {
  const module = { exports: undefined as unknown }
  const code = transformSync(`const hozoStyles=${styles}; module.exports=(${jsx})`, {
    loader: 'tsx',
    jsxFactory: 'h',
  }).code
  runInNewContext(code, {
    module,
    View: 'View',
    Text: 'Text',
    HozoChip: 'Chip',
    h: (_type: unknown, props: unknown) => props,
    StyleSheet: { create: (value: unknown) => value },
    ...context,
  })
  return module.exports as Record<string, unknown>
}

test('root and secondary mixed ternaries capture selection, values and string coercion once in source order', () => {
  for (const secondary of [false, true]) {
    const source = `import {View,Chip} from '@hozo/core'; const own='rounded-md p-2'; const el=${secondary ? '<Chip label="x" removeClassName' : '<View className'}={choose() ? \`\${own} \${first()} \${last()}\` : own} />`
    const web = compiler.compile(source)[0]
    const native = compiler.compileNative(source)[0]
    for (const backend of ['web', 'native'] as const) {
      for (const selected of [true, false]) {
        const calls: string[] = []
        const residuals: unknown[] = []
        const output = backend === 'web' ? web : native
        const props = evaluate(
          output.jsx,
          {
            own: 'rounded-md p-2',
            choose: () => {
              calls.push('choose')
              return selected
            },
            first: () => {
              calls.push('first')
              return {
                [Symbol.toPrimitive](hint: string) {
                  calls.push(`first:${hint}`)
                  return 'p-8'
                },
              }
            },
            last: () => {
              calls.push('last')
              return {
                toString() {
                  calls.push('last:string')
                  return 'rounded-full'
                },
              }
            },
            hozoClasses: (value: unknown) => {
              residuals.push(value)
              return {}
            },
          },
          backend === 'native' ? native.styles : '{}',
        )
        // Native secondary callbacks use only the already captured values.
        for (const value of Object.values(props)) if (typeof value === 'function') value({})
        assert.deepEqual(
          calls,
          selected ? ['choose', 'first', 'first:string', 'last', 'last:string'] : ['choose'],
        )
        if (backend === 'web') {
          const value = String(props[secondary ? 'removeClassName' : 'className'])
          assert.equal(value.includes('rounded-md'), false)
          assert.equal(value.includes('p-2'), false)
          assert.equal(value.includes('p-8'), selected)
          assert.equal(value.includes('rounded-full'), selected)
        } else {
          assert.ok(
            residuals.every(
              (value) => value == null || value === 'p-8' || value === 'rounded-full',
            ),
          )
          if (selected) assert.ok(residuals.includes('p-8') && residuals.includes('rounded-full'))
        }
      }
    }
  }
})

test('a Symbol interpolation still throws before later expressions and never runs in an unselected arm', () => {
  const source =
    "import {View} from '@hozo/core';const own='p-2';const el=<View className={choose() ? `${own} ${first()} ${last()}` : own} />"
  const web = compiler.compile(source)[0]
  const native = compiler.compileNative(source)[0]
  for (const output of [web, native]) {
    const calls: string[] = []
    const context = {
      own: 'p-2',
      choose: () => {
        calls.push('choose')
        return true
      },
      first: () => {
        calls.push('first')
        return Symbol('class')
      },
      last: () => {
        calls.push('last')
        return 'p-8'
      },
      hozoClasses: () => ({}),
    }
    assert.throws(
      () => evaluate(output.jsx, context, 'styles' in output ? output.styles : '{}'),
      /Symbol/,
    )
    assert.deepEqual(calls, ['choose', 'first'])
  }
})
