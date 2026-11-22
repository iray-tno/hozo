import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { inspectStaticModuleImports } from '@hozo/compiler'
import type { LowerModuleOptions } from '@hozo/compiler/lower'
import {
  CACHE_DIR,
  type CarrierClosure,
  type CarrierOwnerSnapshot,
  carrierOwnerRoutes,
  readBoundedUtf8File,
  restoreCarrierOwnerRoutes,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import { bindHozoImports } from './modular-imports.ts'

export interface MetroCarrierOwnerReference {
  file: string
  sha256: string
}

const digest = (text: string) => createHash('sha256').update(text).digest('hex')
type Routes = ReturnType<typeof restoreCarrierOwnerRoutes>
const snapshots = new Map<string, { sha256: string; routes: Routes }>()

export function publishMetroCarrierOwners(root: string, closure: CarrierClosure) {
  const { snapshot } = carrierOwnerRoutes(closure, ['@hozo/patterns', '@hozo/form'])
  if (!snapshot.instances.length) return undefined
  const content = JSON.stringify(snapshot)
  const sha256 = digest(content)
  const file = path.join(root, CACHE_DIR, `owner-routes-${sha256}.json`)
  writeFileIfChanged(file, content)
  return { file, sha256 }
}

export function readMetroCarrierOwners(reference: MetroCarrierOwnerReference): Routes {
  const dir = path.dirname(reference.file)
  const cached = snapshots.get(dir)
  if (cached?.sha256 === reference.sha256) return cached.routes
  const content = readFileSync(reference.file, 'utf8')
  if (digest(content) !== reference.sha256)
    throw new Error('[hozo] Metro owner manifest snapshot hash mismatch; restart Metro')
  const routes = restoreCarrierOwnerRoutes(JSON.parse(content) as CarrierOwnerSnapshot)
  for (const [file, hash] of routes.inputs)
    if (digest(readBoundedUtf8File(file, 65_536)) !== hash)
      throw new Error(`[hozo] Metro owner manifest input changed: ${file}; restart Metro`)
  snapshots.set(dir, { sha256: reference.sha256, routes })
  return routes
}

type Contract = NonNullable<LowerModuleOptions['auditedOwners']>[number]

/** A worker cannot look up results from the later Metro graph. Choose only
 * bindings we can deliver to a physical leaf via the existing barrel split.
 * The same plan is used to deliver the lowered source's imports. */
export function metroCarrierOwnerBindings(routes: Routes, source: string, filename: string) {
  if (!routes.specifiers.some((specifier) => source.includes(specifier))) return undefined
  const rewrite = bindHozoImports(filename)
  const selected = new Map<Contract, Set<string>>()
  const observed = new Map<string, number>()
  const key = (barrel: string, imported: string) => JSON.stringify([barrel, imported])
  rewrite(source, (barrel, imported, entry, leaf) => {
    if (!routes.specifiers.includes(barrel)) return
    const contracts = routes.forResolvedImport(entry, barrel)
    // A re-export into another package is not an owner of this barrel.
    if (!contracts.length || routes.forResolvedImport(leaf, barrel) !== contracts) return
    const binding = key(barrel, imported)
    observed.set(binding, (observed.get(binding) ?? 0) + 1)
    for (const contract of contracts) {
      if (!contract.exports.includes(imported)) continue
      const exports = selected.get(contract) ?? new Set()
      exports.add(imported)
      selected.set(contract, exports)
    }
  })
  // A mixed/default import can be visible to the compiler but not
  // modularizable. Don't inject the carrier for any unpinned binding that
  // happens to name the same export.
  if (selected.size) {
    const actual = new Map<string, number>()
    for (const { source: barrel, imported } of inspectStaticModuleImports(source, filename)
      .bindings) {
      const binding = key(barrel, imported)
      actual.set(binding, (actual.get(binding) ?? 0) + 1)
    }
    for (const [contract, exported] of selected)
      for (const name of exported) {
        const binding = key(contract.package, name)
        if (observed.get(binding) !== actual.get(binding)) exported.delete(name)
      }
  }
  return {
    rewrite,
    contracts: [...selected].flatMap(([contract, exports]) =>
      exports.size ? [{ ...contract, exports: [...exports] }] : [],
    ),
  }
}
