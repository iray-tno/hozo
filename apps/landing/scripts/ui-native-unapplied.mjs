// Which class props a @hozo/ui component hands its pattern that the
// pattern's React Native half never applies -- "carried and ignored".
//
// The compiler's verdict (`nativeClassReport`) says which classes React
// Native cannot draw. That leaves the other way a look goes missing there:
// a class React Native could draw, handed to a component whose Native half
// accepts the prop for the type's sake and does nothing with it, as the
// Calendar family's `dayClassName` does. A page whose classes are all
// drawable then read as fine on Native when its look was not applied at all.
//
// A prop counts as applied when either:
//   - the compiler lowers it: the element is a primitive it recognizes, from
//     a module it trusts, and the prop is its root `className` or one of the
//     IR's class slots (`crates/hozo_ir/src/class_slots.rs`), which become
//     style props; or
//   - the pattern's `.native.tsx` uses it -- reads it anywhere but its type
//     declaration and a destructure, or forwards a rest spread that may
//     carry it.
// Otherwise it is reported. Only a definite "never used" counts, so an
// indirect use this reading cannot follow is not called missing. A prop the
// style-slot catalog marks `web-only` is not reported either: it is absent on
// Native by design (ColorPicker's eyedropper), not yet to be done.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const DEFAULT_SOURCES = new Set([
  '@hozo/core',
  '@hozo/patterns',
  '@hozo/primitives',
  '@hozo/rn-compat',
  '@hozo/semantics',
  '@hozo/svg',
])
const PATTERN_PACKAGES = new Set(['@hozo/core', '@hozo/patterns', '@hozo/form', '@hozo/primitives'])

const parse = (file, source) =>
  ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

async function webOnlySlots(repo) {
  const { components } = await import(
    pathToFileURL(path.join(repo, 'scripts/style-slots/catalog.mjs')).href
  )
  const out = new Set()
  for (const [component, slots] of Object.entries(components)) {
    for (const slot of slots)
      if (slot.lowering === 'web-only') out.add(`${component}.${slot.classProp}`)
  }
  return out
}
const webOnly = await webOnlySlots(path.resolve(import.meta.dirname, '../../..'))

function compilerFacts(repo) {
  const jsx = readFileSync(path.join(repo, 'crates/hozo_parser/src/jsx.rs'), 'utf8')
  const primitives = new Set(
    [...jsx.matchAll(/"([A-Za-z]+)" => Some\(Primitive::/g)].map((m) => m[1]),
  )
  const slotsSource = readFileSync(path.join(repo, 'crates/hozo_ir/src/class_slots.rs'), 'utf8')
  const slots = new Map()
  for (const [, component, body] of slotsSource.matchAll(/Self::(\w+) => &\[([\s\S]*?)\]/g)) {
    slots.set(component, new Set([...body.matchAll(/class_prop: "(\w+)"/g)].map((m) => m[1])))
  }
  return { primitives, slots }
}

/** The file a package's Native entry exports `name` from, and its local name there. */
function resolveNative(repo, pkg, name, seen = new Set()) {
  const key = `${pkg}:${name}`
  if (seen.has(key)) return undefined
  seen.add(key)
  const dir = path.join(repo, 'packages', pkg.replace('@hozo/', ''), 'src')
  const entry = ['index.native.ts', 'index.native.tsx', 'index.ts', 'index.tsx']
    .map((file) => path.join(dir, file))
    .find(existsSync)
  if (!entry) return undefined
  const file = parse(entry, readFileSync(entry, 'utf8'))
  for (const statement of file.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue
    const from = statement.moduleSpecifier.text
    const follow = (local) => {
      if (from.startsWith('@hozo/')) return resolveNative(repo, from, local, seen)
      const base = path.join(dir, from).replace(/\.(tsx?|native\.tsx?)$/, '')
      const target = [`${base}.native.tsx`, `${base}.native.ts`, `${base}.tsx`, `${base}.ts`].find(
        existsSync,
      )
      return target && { file: target, local }
    }
    if (!statement.exportClause) {
      const found = from.startsWith('@hozo/') && resolveNative(repo, from, name, seen)
      if (found) return found
      continue
    }
    if (!ts.isNamedExports(statement.exportClause)) continue
    for (const spec of statement.exportClause.elements) {
      if (spec.name.text === name) return follow((spec.propertyName ?? spec.name).text)
    }
  }
  return undefined
}

/** Whether a Native module uses `prop` beyond declaring and destructuring it. */
function usesProp(file, prop) {
  const tree = parse(file, readFileSync(file, 'utf8'))
  let used = false
  const aliases = new Set()
  // A rest binding (`...rest`) that is spread on again may carry the prop
  // on to something that applies it.
  const rests = new Set()
  const spreads = new Set()
  const visit = (node) => {
    if (used) return
    if (
      (ts.isSpreadAssignment(node) || ts.isJsxSpreadAttribute(node) || ts.isSpreadElement(node)) &&
      ts.isIdentifier(node.expression)
    ) {
      spreads.add(node.expression.text)
    }
    if (ts.isBindingElement(node) && node.dotDotDotToken && ts.isIdentifier(node.name)) {
      rests.add(node.name.text)
    }
    if (ts.isBindingElement(node)) {
      const property =
        node.propertyName && ts.isIdentifier(node.propertyName) ? node.propertyName.text : undefined
      const local = ts.isIdentifier(node.name) ? node.name.text : undefined
      if (property === prop && local) aliases.add(local)
      else if (!property && local === prop) aliases.add(local)
    }
    if (ts.isIdentifier(node) && (node.text === prop || aliases.has(node.text))) {
      const parent = node.parent
      const declaration =
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node))
      if (!declaration) used = true
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  const forwarded = !aliases.size && [...rests].some((name) => spreads.has(name))
  return used || forwarded
}

/**
 * The class props in a @hozo/ui source that its patterns' Native halves do
 * not apply: `[{ element, prop }]`. `element` narrows to one element, for a
 * file that draws two components.
 */
export function unappliedOnNative(repo, uiFile, element) {
  const facts = compilerFacts(repo)
  const source = readFileSync(uiFile, 'utf8')
  const tree = parse(uiFile, source)
  const imports = new Map()
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings) continue
    const from = statement.moduleSpecifier.text
    if (!PATTERN_PACKAGES.has(from) || !ts.isNamedImports(statement.importClause.namedBindings))
      continue
    for (const spec of statement.importClause.namedBindings.elements) {
      imports.set(spec.name.text, { from, imported: (spec.propertyName ?? spec.name).text })
    }
  }
  const found = []
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(tree)
      const origin = imports.get(tag)
      if (origin && (!element || tag === element)) {
        const lowered = DEFAULT_SOURCES.has(origin.from) && facts.primitives.has(origin.imported)
        const target = resolveNative(repo, origin.from, origin.imported)
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute)) continue
          const prop = attribute.name.getText(tree)
          if (prop !== 'className' && !prop.endsWith('ClassName')) continue
          if (lowered && (prop === 'className' || facts.slots.get(origin.imported)?.has(prop)))
            continue
          if (webOnly.has(`${origin.imported}.${prop}`)) continue
          if (!target || usesProp(target.file, prop)) continue
          if (!found.some((entry) => entry.prop === prop)) found.push({ element: tag, prop })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}
