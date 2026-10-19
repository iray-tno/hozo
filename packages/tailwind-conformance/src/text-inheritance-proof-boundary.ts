// A component-type substitution at one of two alternate Text sites can
// remount child state. Keep this identity proof shared by the experiments.
// Failing it means runtime inheritance, not an authoring error.
import { type NodePath, types as t } from '@babel/core'

export function nativeTextBinding(path: NodePath<t.JSXElement>) {
  const name = path.node.openingElement.name
  if (!t.isJSXIdentifier(name)) return
  const binding = path.scope.getBinding(name.name)
  if (!binding?.constant || !binding.path.isImportSpecifier()) return
  const declaration = binding.path.parent
  const imported = binding.path.node.imported
  if (
    t.isImportDeclaration(declaration) &&
    declaration.source.value === 'react-native' &&
    declaration.importKind !== 'type' &&
    binding.path.node.importKind !== 'type' &&
    ((t.isIdentifier(imported) && imported.name === 'Text') ||
      (t.isStringLiteral(imported) && imported.value === 'Text'))
  )
    return binding
}

export function isStableTextRoot(path: NodePath<t.JSXElement>): boolean {
  const render = path.getFunctionParent()
  const body = render?.node.body
  const renderName = render?.isFunctionExpression() ? render.node.id?.name : undefined
  const renderEscapes = renderName && render?.scope.getBinding(renderName)?.referenced
  const last = t.isBlockStatement(body) ? body.body.at(-1) : undefined
  const stableRoot =
    body === path.node ||
    (t.isBlockStatement(body) &&
      body.body.length > 0 &&
      body.body.slice(0, -1).every((statement) => t.isVariableDeclaration(statement)) &&
      t.isReturnStatement(last) &&
      last.argument === path.node)
  const call = render?.parentPath
  const memo =
    call?.isCallExpression() && t.isIdentifier(call.node.callee)
      ? call.scope.getBinding(call.node.callee.name)
      : undefined
  const memoImport = memo?.path
  return Boolean(
    stableRoot &&
      !renderEscapes &&
      call?.isCallExpression() &&
      call.node.arguments[0] === render?.node &&
      memo?.constant &&
      memoImport?.isImportSpecifier() &&
      t.isIdentifier(memoImport.node.imported, { name: 'memo' }) &&
      t.isImportDeclaration(memoImport.parent) &&
      memoImport.parent.source.value === 'react' &&
      memoImport.parent.importKind !== 'type' &&
      memoImport.node.importKind !== 'type',
  )
}
