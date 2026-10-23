// Reference-only: none of this data is consumed by production compilation.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { __unstable__loadDesignSystem, compile } from 'tailwindcss'
import {
  ORDER_CORPUS_VERSION,
  ORDER_REFERENCE_EXTRA_CSS,
  ORDER_REFERENCE_VERSION,
  orderCandidates,
  orderCases,
  orderDescriptorProbes,
} from './tailwind-order-corpus.ts'

export const orderHash = (value: string) => createHash('sha256').update(value).digest('hex')
const require = createRequire(import.meta.url)
export const orderSnapshotFile = new URL(
  '../fixtures/tailwind-order-reference.json',
  import.meta.url,
)

export async function prepareOrderReference() {
  const root = path.dirname(require.resolve('tailwindcss/theme.css'))
  const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version
  assert.equal(
    version,
    ORDER_REFERENCE_VERSION,
    'review the pinned reference/corpus on a Tailwind upgrade',
  )
  const input = `${readFileSync(path.join(root, 'theme.css'), 'utf8')}\n${ORDER_REFERENCE_EXTRA_CSS}\n@tailwind utilities;`
  const design = await __unstable__loadDesignSystem(input)
  const css = (await compile(input)).build(orderCandidates)
  const descriptors = orderCandidates.map((candidate) => {
    const parsed = design.parseCandidate(candidate)
    const rules = parsed.flatMap((entry) =>
      design.compileAstNodes(entry).map(({ node, propertySort }) => {
        const properties: string[] = [],
          conditions: string[] = []
        function visit(current) {
          if (current.kind === 'declaration') properties.push(current.property)
          if (current.kind === 'at-rule') conditions.push(`${current.name} ${current.params}`)
          if (current.kind === 'rule') conditions.push(current.selector)
          for (const child of current.nodes ?? []) visit(child)
        }
        visit(node)
        return { order: propertySort.order, count: propertySort.count, properties, conditions }
      }),
    )
    assert.ok(rules.length, `reference lost ${candidate}`)
    return { candidate, rules }
  })
  const ranks = design.getClassOrder(orderCandidates)
  assert.ok(
    ranks.every(([, rank]) => rank !== null),
    'no candidate can disappear from the reference',
  )
  const order = [...ranks]
    .sort(([, a], [, b]) => (a! < b! ? -1 : a! > b! ? 1 : 0))
    .map(([name]) => name)
  return {
    css,
    snapshot: {
      schema: 1,
      corpusVersion: ORDER_CORPUS_VERSION,
      tailwindVersion: version,
      themeSha256: orderHash(input),
      corpusSha256: orderHash(JSON.stringify({ orderCases, orderDescriptorProbes })),
      firstRuleClassOrder: order,
      descriptors,
    },
  }
}

// One descriptor per line keeps this generated test fixture reviewable.
export function formatOrderReference(
  snapshot: Awaited<ReturnType<typeof prepareOrderReference>>['snapshot'],
) {
  const { descriptors, ...header } = snapshot
  return `${JSON.stringify(header, null, 2).slice(0, -2)},\n  "descriptors": [\n${descriptors.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]\n}\n`
}
