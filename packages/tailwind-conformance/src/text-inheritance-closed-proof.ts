// Private post-Metro proof, not a second style resolver. No expression is
// executed and no source is rewritten. The test loader can bind RN Text
// directly only when *every* use of that module's Text binding is covered.
import { types as t, transformSync } from '@babel/core'
import { TEXT_PROPERTIES } from './text-inheritance-fixtures.ts'
import { isStableTextRoot } from './text-inheritance-proof-boundary.ts'

type Decision = {
  start: number
  end: number
  subject: string
  disposition: 'closed-leaf' | 'reference'
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

export function proveClosedText(code: string) {
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
                if (!t.isJSXIdentifier(opening.name)) return
                const binding = path.scope.getBinding(opening.name.name)
                if (!binding?.constant || !binding.path.isImportSpecifier()) return
                const declaration = binding.path.parent
                const imported = binding.path.node.imported
                if (
                  !t.isImportDeclaration(declaration) ||
                  declaration.source.value !== 'react-native' ||
                  !(
                    (t.isIdentifier(imported) && imported.name === 'Text') ||
                    (t.isStringLiteral(imported) && imported.value === 'Text')
                  )
                )
                  return
                const decide = (reason: string, eligible = false) => {
                  decisions.push({
                    start: opening.start!,
                    end: opening.end!,
                    subject: code.slice(opening.start!, opening.end!),
                    disposition: eligible ? 'closed-leaf' : 'reference',
                    reason,
                  })
                }
                if (declaration.importKind === 'type' || binding.path.node.importKind === 'type') {
                  decide('not a runtime Text binding')
                  return
                }
                if (!isStableTextRoot(path)) {
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
                const attrs = opening.attributes.filter(
                  (attribute) => t.isJSXAttribute(attribute) && attribute.name.name === 'style',
                )
                if (
                  attrs.length !== 1 ||
                  !t.isJSXAttribute(attrs[0]) ||
                  !t.isJSXExpressionContainer(attrs[0].value) ||
                  !t.isObjectExpression(attrs[0].value.expression)
                ) {
                  decide(
                    'requires one inline object; array/registered style proof is not implemented',
                  )
                  return
                }
                const fields = new Map<string, t.Node>()
                for (const property of attrs[0].value.expression.properties) {
                  if (!t.isObjectProperty(property) || property.computed) {
                    decide('spread, getter, method or computed style')
                    return
                  }
                  const name = t.isIdentifier(property.key)
                    ? property.key.name
                    : t.isStringLiteral(property.key)
                      ? property.key.value
                      : null
                  if (name === null || name === '__proto__' || fields.has(name)) {
                    decide('ambiguous style property')
                    return
                  }
                  fields.set(name, property.value)
                }
                if (
                  !required.every((name) => fields.has(name) && scalar(name, fields.get(name)!))
                ) {
                  decide('not all seven own fields are unconditional supported scalars')
                  return
                }
                if (
                  !path.node.children.every(
                    (child) =>
                      t.isJSXText(child) ||
                      (t.isJSXExpressionContainer(child) &&
                        (t.isStringLiteral(child.expression) ||
                          t.isNumericLiteral(child.expression) ||
                          t.isJSXEmptyExpression(child.expression))),
                  )
                ) {
                  decide('opaque children may consume the published frame')
                  return
                }
                selected.add(path.node)
                decide(
                  'complete own frame and literal children; no inheritance read or publish needed',
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
                ? 'every RN Text use is a proved stable closed leaf'
                : opaqueAccess
                  ? 'opaque native module access'
                  : 'another Text binding use is outside the proof',
              bindings: uses,
            }
            if (!plainText)
              for (const decision of decisions)
                if (decision.disposition === 'closed-leaf') {
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
