// Imports from Hozo's barrels, rewritten to the modules that define each name.
//
// Metro does not tree-shake. A module that imports one name from
// `@hozo/core` loads `@hozo/core`'s entry, which re-exports `@hozo/patterns`,
// `@hozo/primitives`, `@hozo/semantics` and `@hozo/typography` -- so one
// `import { Dialog } from '@hozo/core'` puts every pattern in the bundle, used
// or not (#683). The compiled output already avoids this for what it emits:
// it imports runtime pieces leaf by leaf (`scripts/generated-abi.mjs`). This
// does the same for what the author wrote and the compiler left standing.
//
//     import { Dialog, FlatList } from '@hozo/core'
//   becomes
//     import { Dialog } from '../node_modules/@hozo/patterns/dist/dialog.native.js'
//     import { HozoFlatList as FlatList } from '../node_modules/@hozo/primitives/dist/flat-list.native.js'
//
// The map is read off the barrels themselves -- `export { a as b } from`,
// `export * from`, and the names a module defines -- following each name to
// the module that declares it, so it cannot drift from what the packages
// export. Anything it cannot follow stays imported from the barrel, which is
// slower and still correct. Native only: Metro's resolver, the `react-native`
// export condition, and the bundler that needs it; Vite and Next tree-shake
// on their own.

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { importSpecifier } from '@hozo/compiler/project'

/** The barrels whose named imports are rewritten. */
export const MODULAR_SOURCES = [
  '@hozo/core',
  '@hozo/patterns',
  '@hozo/primitives',
  '@hozo/semantics',
  '@hozo/typography',
  '@hozo/behaviors',
  '@hozo/form',
] as const

interface Origin {
  /** The module that declares the name. */
  file: string
  /** What that module calls it. */
  name: string
}

type ExportTable = Map<string, Origin | null>

const tables = new Map<string, ExportTable>()

/** The file a package's entry resolves to under the `react-native` condition. */
function packageEntry(spec: string, fromDir: string): string | null {
  try {
    // Walked rather than `require.resolve(`${spec}/package.json`)`, which a
    // package whose `exports` does not list `./package.json` refuses. Each
    // `node_modules` up the tree, as Node and Metro look -- under pnpm the
    // real path of a dependency's own file finds its siblings this way too.
    let manifestPath: string | null = null
    for (let dir = path.resolve(fromDir); ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', ...spec.split('/'), 'package.json')
      if (existsSync(candidate)) {
        manifestPath = realpathSync(candidate)
        break
      }
      if (path.dirname(dir) === dir) break
    }
    if (!manifestPath) return null
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      exports?: Record<string, unknown>
      main?: string
    }
    const root = manifest.exports?.['.']
    const pick = (value: unknown): string | undefined => {
      if (typeof value === 'string') return value
      if (value && typeof value === 'object') {
        const conditions = value as Record<string, unknown>
        return pick(conditions['react-native']) ?? pick(conditions.default)
      }
      return undefined
    }
    const entry = pick(root) ?? manifest.main
    return entry ? path.resolve(path.dirname(manifestPath), entry) : null
  } catch {
    return null
  }
}

function resolveSpecifier(spec: string, fromFile: string): string | null {
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec)
  if (spec.startsWith('@hozo/')) return packageEntry(spec, path.dirname(fromFile))
  return null
}

function specifiers(list: string): { imported: string; exported: string }[] {
  return list
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !part.startsWith('type '))
    .map((part) => {
      const [imported = '', exported = imported] = part.split(/\s+as\s+/).map((name) => name.trim())
      return { imported, exported }
    })
}

/**
 * Every name a built module exports, mapped to the module that declares it.
 * `null` for a name it exports but this cannot follow.
 */
function exportTable(file: string, seen: Set<string> = new Set()): ExportTable {
  const cached = tables.get(file)
  if (cached) return cached
  const table: ExportTable = new Map()
  if (seen.has(file)) return table
  seen.add(file)
  let source: string
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    tables.set(file, table)
    return table
  }
  // Declared here: `export function X`, `export const X`, `export class X`.
  for (const match of source.matchAll(
    /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    table.set(match[1] as string, { file, name: match[1] as string })
  }
  // Re-exported: `export { a, b as c } from '…'`.
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm)) {
    const target = resolveSpecifier(match[2] as string, file)
    for (const { imported, exported } of specifiers(match[1] as string)) {
      if (!target) {
        table.set(exported, null)
        continue
      }
      const origin = exportTable(target, seen).get(imported)
      table.set(exported, origin === undefined ? { file: target, name: imported } : origin)
    }
  }
  // Exported from a local binding: `export { a as b }` with no `from`.
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}\s*;?\s*$/gm)) {
    for (const { imported, exported } of specifiers(match[1] as string)) {
      if (!table.has(exported)) table.set(exported, { file, name: imported })
    }
  }
  // `export * from '…'`: everything the target exports, except what is named here.
  for (const match of source.matchAll(/^export\s*\*\s*from\s*['"]([^'"]+)['"]/gm)) {
    const target = resolveSpecifier(match[1] as string, file)
    if (!target) continue
    for (const [name, origin] of exportTable(target, seen)) {
      if (name !== 'default' && !table.has(name)) table.set(name, origin)
    }
  }
  tables.set(file, table)
  return table
}

const IMPORT_RE = new RegExp(
  `import\\s*\\{([^}]*)\\}\\s*from\\s*['"](${MODULAR_SOURCES.map((s) => s.replace('/', '\\/')).join('|')})['"];?[ \\t]*\\n?`,
  'g',
)

/**
 * `code` with each named import from a Hozo barrel split into imports from
 * the modules that define the names. `filename` is absolute. Names it cannot
 * follow stay on the barrel; `import type` and namespace imports are left
 * alone.
 */
export function modularizeHozoImports(code: string, filename: string): string {
  if (!MODULAR_SOURCES.some((source) => code.includes(source))) return code
  return code.replace(IMPORT_RE, (statement, list: string, barrel: string) => {
    const entry = packageEntry(barrel, path.dirname(filename))
    if (!entry) return statement
    const table = exportTable(entry)
    const byFile = new Map<string, string[]>()
    const kept: string[] = []
    for (const part of list
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)) {
      if (part.startsWith('type ')) {
        kept.push(part)
        continue
      }
      const [imported = '', local = imported] = part.split(/\s+as\s+/).map((name) => name.trim())
      const origin = table.get(imported)
      if (!origin) {
        kept.push(part)
        continue
      }
      const specifier = origin.name === local ? local : `${origin.name} as ${local}`
      byFile.set(origin.file, [...(byFile.get(origin.file) ?? []), specifier])
    }
    const lines = [...byFile].map(
      ([file, names]) =>
        `import { ${names.join(', ')} } from ${JSON.stringify(importSpecifier(filename, file))}\n`,
    )
    if (kept.length > 0) lines.push(`import { ${kept.join(', ')} } from '${barrel}'\n`)
    return lines.join('')
  })
}
