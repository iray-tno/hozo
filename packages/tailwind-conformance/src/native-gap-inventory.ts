// A review inventory, not a style data-flow proof or an eligibility decision.
// Follow import bindings rather than matching the spelling of a helper: an
// aliased resolver still needs review, and a shadowed name is not that resolver.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { type NodePath, types as t, transformSync } from '@babel/core'

type Helper = 'classes' | 'author'
export type GapHelperUse = { helper: Helper; kind: 'call' | 'opaque'; subject: string }

const sources = new Map<string, Map<string, Helper>>([
  ['@hozo/engine/project', new Map([['hozoClasses', 'classes']])],
  ['@hozo/engine/generated/gap-styles', new Map([['hozoAuthoredStyle', 'author']])],
  ['@hozo/core/generated/gap-styles', new Map([['hozoAuthoredStyle', 'author']])],
])

export function gapHelperUses(source: string, filename = 'inventory.tsx'): GapHelperUse[] {
  const uses: GapHelperUse[] = []
  const record = (helper: Helper, reference: NodePath) => {
    const parent = reference.parentPath
    const direct = parent?.isCallExpression() && parent.node.callee === reference.node
    uses.push({
      helper,
      kind: direct ? 'call' : 'opaque',
      subject: (direct ? parent : reference).toString(),
    })
  }
  transformSync(source, {
    filename,
    configFile: false,
    babelrc: false,
    code: false,
    parserOpts: {
      sourceType: 'module',
      plugins: filename.endsWith('tsx') ? ['typescript', 'jsx'] : ['typescript'],
    },
    plugins: [
      () => ({
        visitor: {
          ImportDeclaration(importPath) {
            const helpers = sources.get(importPath.node.source.value)
            if (!helpers || importPath.node.importKind === 'type') return
            for (const specifier of importPath.node.specifiers) {
              if (t.isImportSpecifier(specifier) && specifier.importKind === 'type') continue
              const binding = importPath.scope.getBinding(specifier.local.name)
              if (!binding) throw new Error(`Missing import binding in ${filename}`)
              if (t.isImportSpecifier(specifier)) {
                const name = t.isIdentifier(specifier.imported)
                  ? specifier.imported.name
                  : specifier.imported.value
                const helper = helpers.get(name)
                if (helper)
                  for (const reference of binding.referencePaths) record(helper, reference)
              } else if (t.isImportNamespaceSpecifier(specifier)) {
                for (const reference of binding.referencePaths) {
                  const member = reference.parentPath
                  if (member?.isMemberExpression() && member.node.object === reference.node) {
                    const property = member.node.property
                    const name =
                      !member.node.computed && t.isIdentifier(property)
                        ? property.name
                        : t.isStringLiteral(property)
                          ? property.value
                          : undefined
                    if (name !== undefined) {
                      const helper = helpers.get(name)
                      if (helper) record(helper, member)
                      continue
                    }
                  }
                  // Passing the namespace or indexing it dynamically may hide
                  // either helper. Do not turn that lack of knowledge into zero.
                  for (const helper of helpers.values()) {
                    uses.push({ helper, kind: 'opaque', subject: reference.toString() })
                  }
                }
              }
            }
          },
          ExportNamedDeclaration(exportPath) {
            const helpers = sources.get(exportPath.node.source?.value ?? '')
            if (!helpers || exportPath.node.exportKind === 'type') return
            for (const specifier of exportPath.node.specifiers) {
              if (t.isExportSpecifier(specifier) && specifier.exportKind === 'type') continue
              if (t.isExportNamespaceSpecifier(specifier)) {
                for (const helper of helpers.values()) {
                  uses.push({ helper, kind: 'opaque', subject: exportPath.toString() })
                }
                continue
              }
              const name = t.isExportSpecifier(specifier) ? specifier.local.name : undefined
              const helper = name && helpers.get(name)
              if (helper) uses.push({ helper, kind: 'opaque', subject: exportPath.toString() })
            }
          },
          ExportAllDeclaration(exportPath) {
            const helpers = sources.get(exportPath.node.source.value)
            if (!helpers || exportPath.node.exportKind === 'type') return
            for (const helper of helpers.values()) {
              uses.push({ helper, kind: 'opaque', subject: exportPath.toString() })
            }
          },
        },
      }),
    ],
  })
  return uses
}

const omitted = new Set([
  'test',
  'tests',
  '__tests__',
  'fixtures',
  '__fixtures__',
  'node_modules',
  'dist',
])
const productionSource = (file: string) =>
  /\.(ts|tsx)$/.test(file) && !/\.(test|spec|stories|bench|d)\./.test(file)

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return omitted.has(entry.name) ? [] : files(full)
    if (!productionSource(full) || /\.(web|dom)\./.test(full)) return []
    if (!/\.native\./.test(full)) {
      const stem = full.replace(/\.(ts|tsx)$/, '')
      if (['.native.ts', '.native.tsx'].some((suffix) => existsSync(stem + suffix))) return []
    }
    return [full]
  })
}

export function nativeGapInventory(root: string) {
  const packages = path.join(root, 'packages')
  const roots = readdirSync(packages)
    .filter((name) =>
      ['index.native.ts', 'index.native.tsx'].some((entry) =>
        existsSync(path.join(packages, name, 'src', entry)),
      ),
    )
    .sort()
  const scanned = roots.flatMap((name) => files(path.join(packages, name, 'src'))).sort()
  const consumers = scanned.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    const uses = gapHelperUses(source, file)
    return uses.length ? [{ file: path.relative(root, file).split(path.sep).join('/'), uses }] : []
  })
  return { roots, scannedFiles: scanned.length, consumers }
}
