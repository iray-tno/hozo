// Private post-Metro proof, not a second style resolver. No expression is
// executed and no source is rewritten. The test loader can bind RN Text
// directly only when *every* use of that module's Text binding is covered.
import { type NodePath, types as t, transformSync } from '@babel/core'
import { TEXT_PROPERTIES } from './text-inheritance-fixtures.ts'
import { isStableTextRoot, nativeTextBinding } from './text-inheritance-proof-boundary.ts'
import { resolveTextStyle } from './text-inheritance-style-proof.ts'

type Decision = {
  start: number
  end: number
  subject: string
  disposition: 'closed-leaf' | 'closed-subtree' | 'reference'
  reason: string
}

const required = Object.values(TEXT_PROPERTIES)
const scalar = (name: string, value: t.Node): boolean => {
  if (name === 'color')
    return (
      t.isStringLiteral(value) && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value.value)
    )
  if (['fontSize', 'lineHeight', 'letterSpacing'].includes(name))
    return t.isNumericLiteral(value) && Number.isFinite(value.value)
  if (name === 'fontWeight')
    return (
      (t.isStringLiteral(value) && /^(normal|bold|[1-9]00)$/.test(value.value)) ||
      (t.isNumericLiteral(value) &&
        value.value >= 100 &&
        value.value <= 900 &&
        value.value % 100 === 0)
    )
  if (name === 'textAlign')
    return (
      t.isStringLiteral(value) &&
      ['left', 'center', 'right', 'auto', 'justify'].includes(value.value)
    )
  if (name === 'textTransform')
    return (
      t.isStringLiteral(value) &&
      ['none', 'uppercase', 'lowercase', 'capitalize'].includes(value.value)
    )
  return false
}

const literalChild = (child: t.Node) =>
  t.isJSXText(child) ||
  (t.isJSXExpressionContainer(child) &&
    (t.isStringLiteral(child.expression) ||
      t.isNumericLiteral(child.expression) ||
      t.isJSXEmptyExpression(child.expression)))

function knownChildren(path: NodePath<t.JSXElement | t.JSXFragment>): boolean {
  return path.get('children').every(
    (child) =>
      literalChild(child.node) ||
      (child.isJSXFragment() && knownChildren(child)) ||
      // Complete styles are checked for *each* node by the normal visitor.
      // The import-wide coverage gate rejects the region if any node fails.
      (child.isJSXElement() && Boolean(nativeTextBinding(child)) && knownChildren(child)),
  )
}

function stableNestedRoot(path: NodePath<t.JSXElement>) {
  let root: NodePath = path
  while (root.parentPath?.isJSXElement() || root.parentPath?.isJSXFragment()) {
    root = root.parentPath
    if (root.isJSXElement() && !nativeTextBinding(root)) return false
  }
  return root.isJSXElement() && isStableTextRoot(root)
}

export const proveClosedText = (code: string) => analyzeClosedText(code, false)
export const proveTextSubtree = (code: string) => analyzeClosedText(code, true)

function analyzeClosedText(code: string, subtrees: boolean) {
  const decisions: Decision[] = []
  let plainText = false
  let boundary = {
    reason: 'no eligible Text leaf',
    bindings: [] as { name: string; uses: number; covered: boolean }[],
  }
  transformSync(code, {
    configFile: false,
    babelrc: false,
    filename: 'closed-text-experiment.tsx',
    parserOpts: { sourceType: 'module', plugins: ['jsx', 'typescript'] },
    plugins: [
      () => ({
        visitor: {
          Program(program) {
            const selected = new Set<t.JSXElement>()
            const bindings = new Set<ReturnType<typeof program.scope.getBinding>>()
            let opaqueAccess = false
            program.traverse({
              ImportDeclaration(path) {
                if (path.node.source.value !== 'react-native') return
                for (const specifier of path.node.specifiers) {
                  if (!t.isImportSpecifier(specifier)) {
                    opaqueAccess = true
                    continue
                  }
                  const name = t.isIdentifier(specifier.imported)
                    ? specifier.imported.name
                    : specifier.imported.value
                  if (name === 'Text') bindings.add(path.scope.getBinding(specifier.local.name))
                }
              },
              ExportNamedDeclaration(path) {
                if (path.node.source?.value === 'react-native') opaqueAccess = true
              },
              ExportAllDeclaration(path) {
                if (path.node.source.value === 'react-native') opaqueAccess = true
              },
              ReferencedIdentifier(path) {
                if (
                  ['require', 'eval', 'Function'].includes(path.node.name) &&
                  !path.scope.getBinding(path.node.name)
                )
                  opaqueAccess = true
              },
              CallExpression(path) {
                if (t.isImport(path.node.callee)) opaqueAccess = true
              },
              ImportExpression() {
                opaqueAccess = true
              },
              JSXElement(path) {
                const opening = path.node.openingElement
                if (!nativeTextBinding(path)) return
                const decide = (reason: string, eligible = false) => {
                  decisions.push({
                    start: opening.start!,
                    end: opening.end!,
                    subject: code.slice(opening.start!, opening.end!),
                    disposition: eligible
                      ? subtrees
                        ? 'closed-subtree'
                        : 'closed-leaf'
                      : 'reference',
                    reason,
                  })
                }
                if (!(subtrees ? stableNestedRoot(path) : isStableTextRoot(path))) {
                  decide('no stable memo render root proof')
                  return
                }
                if (
                  opening.attributes.some(
                    (attribute) =>
                      t.isJSXSpreadAttribute(attribute) ||
                      (t.isJSXAttribute(attribute) &&
                        ['children', 'className'].includes(String(attribute.name.name))),
                  )
                ) {
                  decide('unknown props, children or class style')
                  return
                }
                const attrs = path
                  .get('openingElement')
                  .get('attributes')
                  .filter(
                    (attribute) =>
                      attribute.isJSXAttribute() && attribute.node.name.name === 'style',
                  )
                if (
                  attrs.length !== 1 ||
                  !attrs[0].isJSXAttribute() ||
                  !t.isJSXExpressionContainer(attrs[0].node.value)
                ) {
                  decide('requires one explicit style expression')
                  return
                }
                const value = attrs[0].get('value')
                const fields = value.isJSXExpressionContainer()
                  ? resolveTextStyle(value.get('expression'))
                  : undefined
                if (!fields) {
                  decide('unknown or escaping style expression; keep runtime resolution')
                  return
                }
                if (
                  !required.every((name) => fields.has(name) && scalar(name, fields.get(name)!))
                ) {
                  decide('not all seven own fields are unconditional supported scalars')
                  return
                }
                if (!(subtrees ? knownChildren(path) : path.node.children.every(literalChild))) {
                  decide('opaque children may consume the published frame')
                  return
                }
                selected.add(path.node)
                decide(
                  subtrees
                    ? 'complete own frame and known Text children; coverage requires every descendant to own its frame'
                    : 'complete own frame and literal children; no inheritance read or publish needed',
                  true,
                )
              },
            })
            const uses = [...bindings].map((binding) => ({
              name: binding?.identifier.name ?? 'unresolved',
              uses: binding?.referencePaths.length ?? 0,
              covered: Boolean(
                binding?.constant &&
                  binding.referencePaths.every((reference) => {
                    const parent = reference.parentPath
                    return (
                      (parent?.isJSXOpeningElement() || parent?.isJSXClosingElement()) &&
                      selected.has(parent.parentPath.node as t.JSXElement)
                    )
                  }),
              ),
            }))
            plainText =
              selected.size > 0 &&
              !opaqueAccess &&
              uses.length > 0 &&
              uses.every((binding) => binding.covered)
            boundary = {
              reason: plainText
                ? subtrees
                  ? 'every RN Text use belongs to a self-contained stable Text region'
                  : 'every RN Text use is a proved stable closed leaf'
                : opaqueAccess
                  ? 'opaque native module access'
                  : 'another Text binding use is outside the proof',
              bindings: uses,
            }
            if (!plainText)
              for (const decision of decisions)
                if (decision.disposition !== 'reference') {
                  decision.disposition = 'reference'
                  decision.reason = `local proof retained but binding not elided: ${boundary.reason}`
                }
          },
        },
      }),
    ],
  })
  return { code, decisions, plainText, boundary }
}
