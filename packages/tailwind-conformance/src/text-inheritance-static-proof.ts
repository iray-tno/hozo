// A bounded proof experiment, not another production lowering pipeline.
// Inspect the actual post-Metro AST. Never infer safety from fixture IDs,
// rendered values, a missing forwarding summary, or component spelling alone.
import { transformSync } from '@babel/core'
import { isStableTextRoot } from './text-inheritance-proof-boundary.ts'

export type PaintDecision = {
  start: number
  end: number
  subject: string
  disposition: 'masked-paint' | 'reference'
  reason: string
}

export function proveTextPaint(code: string) {
  const decisions: PaintDecision[] = []
  let selected = 0
  const transformed = transformSync(code, {
    configFile: false,
    babelrc: false,
    filename: 'text-inheritance-experiment.tsx',
    parserOpts: { sourceType: 'module', plugins: ['jsx', 'typescript'] },
    plugins: [
      ({ types: t }) => ({
        visitor: {
          Program(program) {
            const helper = program.scope.generateUidIdentifier('PaintMaskedText')
            program.traverse({
              JSXElement(path) {
                const opening = path.node.openingElement
                if (!t.isJSXIdentifier(opening.name)) return
                const binding = path.scope.getBinding(opening.name.name)
                if (!binding?.constant || !binding.path.isImportSpecifier()) return
                const specifier = binding.path.node
                const imported = t.isIdentifier(specifier.imported)
                  ? specifier.imported.name
                  : specifier.imported.value
                if (imported !== 'Text') return
                const declaration = binding.path.parent
                if (
                  !t.isImportDeclaration(declaration) ||
                  declaration.source.value !== 'react-native'
                )
                  return
                if (declaration.importKind === 'type' || specifier.importKind === 'type') return
                const decide = (reason: string, masked = false) => {
                  decisions.push({
                    start: opening.start!,
                    end: opening.end!,
                    subject: code.slice(opening.start!, opening.end!),
                    disposition: masked ? 'masked-paint' : 'reference',
                    reason,
                  })
                }
                const attributes = opening.attributes
                if (attributes.some((attribute) => t.isJSXSpreadAttribute(attribute))) {
                  decide('unknown JSX spread can change style')
                  return
                }
                const styles = attributes.filter(
                  (attribute) => t.isJSXAttribute(attribute) && attribute.name.name === 'style',
                )
                if (styles.length !== 1 || !t.isJSXAttribute(styles[0])) {
                  decide('requires one explicit inline style')
                  return
                }
                if (
                  attributes.some(
                    (attribute) =>
                      t.isJSXAttribute(attribute) && attribute.name.name === 'className',
                  )
                ) {
                  decide('unresolved class style')
                  return
                }
                const value = styles[0].value
                if (!t.isJSXExpressionContainer(value) || !t.isObjectExpression(value.expression)) {
                  decide(
                    'style is not an inline object; arrays and registered styles remain runtime',
                  )
                  return
                }
                const properties = value.expression.properties
                const names = new Set<string>()
                let literalColor = false
                for (const property of properties) {
                  if (!t.isObjectProperty(property) || property.computed) {
                    decide('spread, getter, method or computed property prevents proof')
                    return
                  }
                  const name = t.isIdentifier(property.key)
                    ? property.key.name
                    : t.isStringLiteral(property.key)
                      ? property.key.value
                      : null
                  if (name === null || names.has(name) || name === '__proto__') {
                    decide('ambiguous property shape')
                    return
                  }
                  names.add(name)
                  if (name === 'color') literalColor = t.isStringLiteral(property.value)
                }
                if (!literalColor) {
                  decide('own color is absent or not an unconditional string literal')
                  return
                }
                // Replacing Text's component type inside alternate returns
                // could remount stateful children (two source sites can share
                // one React position). For this first proof accept only an
                // unconditional root of an inline, canonical React.memo
                // render function. memo's object boundary also rules out a
                // callable render helper being inlined at another position.
                if (!isStableTextRoot(path)) {
                  decide(
                    'no stable memo render root proof; changing helper type could remount children',
                  )
                  return
                }
                decide('own literal color masks Paint; keep Metrics and descendant providers', true)
                opening.name = t.jsxIdentifier(helper.name)
                if (path.node.closingElement)
                  path.node.closingElement.name = t.jsxIdentifier(helper.name)
                selected += 1
              },
            })
            if (selected)
              program.unshiftContainer(
                'body',
                t.importDeclaration(
                  [t.importSpecifier(helper, t.identifier('PaintMaskedText'))],
                  t.stringLiteral('fixture:paint-masked-text'),
                ),
              )
          },
        },
      }),
    ],
  })
  // An unsuccessful proof must not even reformat the current generated code.
  return { code: selected ? transformed!.code! : code, decisions }
}
