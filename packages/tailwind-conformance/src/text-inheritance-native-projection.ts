// Evidence projection only, never a renderer or compiler/runtime fallback.
// The counting host stays deliberately unaware of native inheritance.
import assert from 'node:assert/strict'

/** The seven fields React Native's Text inherits from an enclosing Text. */
const TEXT_PROPERTIES = [
  'color',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'textTransform',
] as const

export type TextHostJson =
  | null
  | string
  | TextHostJson[]
  | {
      type: string
      props: Record<string, unknown>
      children: TextHostJson[] | null
    }

export function projectNativeText(
  tree: TextHostJson,
  flatten: (style: unknown) => Record<string, unknown>,
) {
  const actual: Record<string, Record<string, unknown>> = {}
  function visit(node: TextHostJson, inherited: Record<string, unknown>) {
    if (node === null || typeof node === 'string') return
    if (Array.isArray(node)) {
      for (const child of node) visit(child, inherited)
      return
    }
    // RN's attributed-string inheritance is not View-to-Text inheritance.
    const frame: Record<string, unknown> = {}
    if (node.type === 'Text') {
      const own = flatten(node.props.style)
      for (const name of TEXT_PROPERTIES) {
        const value = own[name] ?? inherited[name]
        if (value != null) frame[name] = value
      }
      const id = node.props.testID
      if (typeof id === 'string') {
        assert.ok(!Object.hasOwn(actual, id), `duplicate projected Text ${id}`)
        actual[id] = { ...own, ...frame }
      }
    }
    for (const child of node.children ?? []) visit(child, frame)
  }
  visit(tree, {})
  return actual
}
