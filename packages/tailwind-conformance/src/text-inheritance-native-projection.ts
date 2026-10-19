// Evidence projection only, never a renderer or compiler/runtime fallback.
// The counting host stays deliberately unaware of native inheritance.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { TEXT_PROPERTIES } from './text-inheritance-fixtures.ts'

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
      for (const name of Object.values(TEXT_PROPERTIES)) {
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

// Called only by the uncached standalone evidence command, not unit tests.
// A source observation supports the projection's scope; it is not execution
// of RN's C++ renderer or proof of layout/AT/device behavior.
export function nativeTextSourceEvidence() {
  const require = createRequire(import.meta.url)
  const packageFile = require.resolve('react-native/package.json')
  const root = path.dirname(packageFile)
  const files = [
    'Libraries/Text/Text.js',
    'ReactCommon/react/renderer/components/text/BaseTextShadowNode.cpp',
    'ReactCommon/react/renderer/attributedstring/TextAttributes.cpp',
    'ReactCommon/react/renderer/components/text/BaseTextProps.cpp',
  ].map((name) => {
    const source = readFileSync(path.join(root, name), 'utf8')
    return { name, source, sha256: createHash('sha256').update(source).digest('hex') }
  })
  assert.ok(files[0].source.includes('return <NativeVirtualText'))
  assert.ok(files[1].source.includes('auto localTextAttributes = baseTextAttributes;'))
  assert.ok(files[1].source.includes('localTextAttributes.apply('))
  const apply = files[2].source
    .split('void TextAttributes::apply(TextAttributes textAttributes) {')[1]
    ?.split('#pragma mark')[0]
  assert.ok(apply, 'review a changed RN attribute inheritance implementation')
  const fields = {
    color: 'foregroundColor',
    fontSize: 'fontSize',
    fontWeight: 'fontWeight',
    lineHeight: 'lineHeight',
    letterSpacing: 'letterSpacing',
    textAlign: 'alignment',
    textTransform: 'textTransform',
  }
  for (const [name, attribute] of Object.entries(fields)) {
    assert.ok(apply.includes(`${attribute} =`), attribute)
    assert.ok(files[3].source.includes(`textAttributes.${attribute} =`), name)
    assert.ok(files[3].source.includes(`"${name}"`), name)
  }
  return {
    reactNative: JSON.parse(readFileSync(packageFile, 'utf8')).version,
    assessed: 'source observations plus seven-field projection only; RN C++/Text.js not executed',
    fields,
    sources: files.map(({ name, sha256 }) => ({ name, sha256 })),
    builtinContext: 'RN TextAncestorContext remains; only Hozo inheritance helpers are omitted',
  }
}
