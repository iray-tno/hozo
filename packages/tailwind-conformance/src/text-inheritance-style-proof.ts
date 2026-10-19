// Analyze the compiler's actual style output, not class strings. Registered
// objects must not escape: const protects a binding, not its mutable contents.
import { type NodePath, types as t } from '@babel/core'

const keyOf = (node: t.Node, computed = false) =>
  !computed && t.isIdentifier(node) ? node.name : t.isStringLiteral(node) ? node.value : null

function objectFields(node: t.ObjectExpression, literalsOnly = false) {
  const fields = new Map<string, t.Node>()
  for (const property of node.properties) {
    if (!t.isObjectProperty(property) || property.computed) return
    const name = keyOf(property.key)
    if (name === null || name === '__proto__' || fields.has(name)) return
    if (
      literalsOnly &&
      !(
        t.isStringLiteral(property.value) ||
        t.isNumericLiteral(property.value) ||
        t.isBooleanLiteral(property.value) ||
        t.isNullLiteral(property.value)
      )
    )
      return
    fields.set(name, property.value)
  }
  return fields
}

function nativeImport(path: NodePath, name: string, imported: string) {
  const binding = path.scope.getBinding(name)
  if (!binding?.constant || !binding.path.isImportSpecifier()) return
  const declaration = binding.path.parent
  if (
    !t.isImportDeclaration(declaration) ||
    declaration.source.value !== 'react-native' ||
    declaration.importKind === 'type' ||
    binding.path.node.importKind === 'type' ||
    keyOf(binding.path.node.imported) !== imported
  )
    return
  return binding
}

function isTextStyleRead(reference: NodePath) {
  const member = reference.parentPath
  if (
    !member?.isMemberExpression() ||
    member.node.object !== reference.node ||
    keyOf(member.node.property, member.node.computed) === null
  )
    return false
  let current: NodePath = member
  while (current.parentPath?.isArrayExpression()) current = current.parentPath
  const expression = current.parentPath
  const attribute = expression?.parentPath
  const opening = attribute?.parentPath
  return Boolean(
    expression?.isJSXExpressionContainer() &&
      attribute?.isJSXAttribute() &&
      attribute.node.name.name === 'style' &&
      opening?.isJSXOpeningElement() &&
      t.isJSXIdentifier(opening.node.name) &&
      nativeImport(opening, opening.node.name.name, 'Text'),
  )
}

function registeredFields(path: NodePath<t.MemberExpression>) {
  if (!t.isIdentifier(path.node.object)) return
  const key = keyOf(path.node.property, path.node.computed)
  if (key === null) return
  const binding = path.scope.getBinding(path.node.object.name)
  const declarator = binding?.path
  if (
    !binding?.constant ||
    !declarator?.isVariableDeclarator() ||
    !declarator.parentPath.isVariableDeclaration({ kind: 'const' }) ||
    !declarator.parentPath.parentPath.isProgram() ||
    !binding.referencePaths.every(isTextStyleRead)
  )
    return
  const init = declarator.node.init
  if (
    !t.isCallExpression(init) ||
    init.arguments.length !== 1 ||
    !t.isObjectExpression(init.arguments[0]) ||
    !t.isMemberExpression(init.callee) ||
    init.callee.computed ||
    !t.isIdentifier(init.callee.object) ||
    !t.isIdentifier(init.callee.property, { name: 'create' })
  )
    return
  const sheet = nativeImport(declarator, init.callee.object.name, 'StyleSheet')
  // A reassignment/property write/alias of the import can change create's
  // meaning without violating the registry binding's own constant flag.
  if (
    !sheet?.referencePaths.every((reference) => {
      const member = reference.parentPath
      return (
        member?.isMemberExpression() &&
        member.node.object === reference.node &&
        !member.node.computed &&
        t.isIdentifier(member.node.property, { name: 'create' }) &&
        member.parentPath.isCallExpression() &&
        member.parentPath.node.callee === member.node
      )
    })
  )
    return
  const entries = new Map<string, Map<string, t.Node>>()
  for (const property of init.arguments[0].properties) {
    if (!t.isObjectProperty(property) || property.computed || !t.isObjectExpression(property.value))
      return
    const name = keyOf(property.key)
    const fields = objectFields(property.value, true)
    if (name === null || name === '__proto__' || entries.has(name) || !fields) return
    entries.set(name, fields)
  }
  return entries.get(key)
}

export function resolveTextStyle(path: NodePath<t.Node>): Map<string, t.Node> | undefined {
  if (path.isObjectExpression()) return objectFields(path.node)
  if (path.isMemberExpression()) return registeredFields(path)
  if (path.isNullLiteral() || path.isBooleanLiteral({ value: false })) return new Map()
  if (!path.isArrayExpression()) return
  const fields = new Map<string, t.Node>()
  for (const child of path.get('elements')) {
    // No skipping unknown layers, even if an earlier layer owns all fields.
    // Runtime null/undefined may remove a local override and resume inheritance.
    if (!child.node) return
    const layer = resolveTextStyle(child)
    if (!layer) return
    for (const [name, value] of layer) fields.set(name, value)
  }
  return fields
}
