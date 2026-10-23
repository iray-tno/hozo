// Opt-in/fixture evidence only. A mismatch is recorded, not counted as support.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { createCompiler, openCandidateCache } from '../../compiler/src/index.ts'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { orderCandidates, orderCases } from './tailwind-order-corpus.ts'
import { prepareOrderReference } from './tailwind-order-reference.ts'

export function orderSource(entry: (typeof orderCases)[number], classes = entry.classes) {
  const state = 'state' in entry ? entry.state : undefined
  const host =
    entry.id.startsWith('text-') || entry.id === 'font-weight'
      ? 'Text'
      : state
        ? 'Pressable'
        : 'View'
  return {
    host,
    source: `import {${host}} from '@hozo/core';const el=<${host} testID="order-probe" className=${JSON.stringify(classes)}>Label</${host}>`,
  }
}

export function executeOrderModule(code: string, context: Record<string, unknown> = {}) {
  const module = { exports: {} }
  runInNewContext(transformSync(code, { loader: 'tsx', jsxFactory: 'h', format: 'cjs' }).code, {
    module,
    ...context,
  })
  return module.exports
}

export function orderCandidateFactory(code: string) {
  const js = transformSync(code, { format: 'cjs' }).code
  return () => {
    const module = { exports: {} }
    runInNewContext(js, { module, require: () => ({ createClassResolver }) })
    return (module.exports as { hozoClasses: ReturnType<typeof createClassResolver> }).hozoClasses
  }
}

export const flattenOrderStyle = (value) =>
  Object.assign({}, ...[value].flat(Infinity).filter(Boolean))

export async function prepareOrderSubjects() {
  const compiler = createCompiler()
  const reference = await prepareOrderReference()
  const cache = openCandidateCache()
  cache.scanFile('OrderCorpus.tsx', JSON.stringify(orderCandidates.join(' ')), 1)
  const nativeModule = cache.renderNativeModule()
  const resolve = orderCandidateFactory(nativeModule)()
  const subjects = orderCases.flatMap((entry) =>
    [entry.classes, entry.classes.split(' ').reverse().join(' ')].map((classes) => {
      const { host, source } = orderSource(entry, classes)
      const web = compiler.compile(source)[0]
      const native = compiler.compileNative(source)[0]
      const props = executeOrderModule(
        `const hozoStyles=${native.styles};module.exports=(${native.jsx})`,
        {
          Text: 'text',
          View: 'view',
          Pressable: 'owner',
          HozoPressable: 'owner',
          h: (_type, props) => props,
        },
      ) as { style: unknown }
      const state = 'state' in entry ? entry.state : undefined
      const facts = { hovered: !!state, pressed: state === 'active' }
      const style = typeof props.style === 'function' ? props.style(facts) : props.style
      return {
        id: entry.id,
        host,
        classes,
        state,
        expected: entry.expected,
        web,
        native: { selected: flattenOrderStyle(style), diagnostics: native.diagnostics },
        fallback: flattenOrderStyle(resolve(classes, facts)),
      }
    }),
  )
  return {
    reference,
    subjects,
    nativeModule,
    provenance: {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        encoding: 'utf8',
      }).trim(),
      addonSha256: createHash('sha256')
        .update(readFileSync(new URL('../../compiler/hozo_napi.node', import.meta.url)))
        .digest('hex'),
      harnessSha256: createHash('sha256')
        .update(
          ['tailwind-order-baseline.ts', 'tailwind-order-reference.ts', 'tailwind-order-corpus.ts']
            .map((name) => readFileSync(new URL(name, import.meta.url), 'utf8'))
            .join('\0'),
        )
        .digest('hex'),
    },
    defaultCss: cache.renderCss(),
    orderedCss: cache.renderCss(undefined, reference.snapshot.firstRuleClassOrder),
  }
}

// A scalar selected-style projection, NOT a Native renderer. Retain the raw
// style in the report so the direction/default assumptions can be audited.
export function projectOrderNative(style: Record<string, unknown>, keys: string[], dir: string) {
  return Object.fromEntries(
    keys.map((key) => {
      let value = style[key]
      for (const family of ['padding', 'margin']) {
        if (key === `${family}Left`)
          value = style[`${family}${dir === 'rtl' ? 'End' : 'Start'}`] ?? value
        if (key === `${family}Right`)
          value = style[`${family}${dir === 'rtl' ? 'Start' : 'End'}`] ?? value
      }
      if (key === 'rowGap' || key === 'columnGap') value ??= style.gap
      if (key === 'borderTopLeftRadius') value ??= style.borderRadius
      if (typeof value === 'number')
        return [key, key === 'fontWeight' ? String(value) : `${value}px`]
      if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) {
        const hex = value
        value = `rgb(${[1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).join(', ')})`
      }
      return [key, value ?? null]
    }),
  )
}

export function summarizeOrderCells(cells: { route: string; expected: object; actual: object }[]) {
  const routes: Record<string, { matched: number; mismatched: number }> = {}
  for (const { route, expected, actual } of cells) {
    const counts = (routes[route] ??= { matched: 0, mismatched: 0 })
    counts[JSON.stringify(expected) === JSON.stringify(actual) ? 'matched' : 'mismatched']++
  }
  return routes
}
