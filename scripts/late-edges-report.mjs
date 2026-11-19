// Shared by measure-metro-late-edges.mjs and measure-vite-late-edges.mjs
// (#2047): which package instances a real build reached, against the
// declaration closure a capture made before the module graph could have.

import { readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ownerCache = new Map()

/** The nearest directory with a named package.json, by realpath: the package
 * instance a file belongs to. Null for a virtual module. */
export function instanceOf(file) {
  const clean = file.split('?')[0]
  if (!path.isAbsolute(clean)) return null
  let dir
  try {
    dir = path.dirname(realpathSync(clean))
  } catch {
    return null // a virtual module, such as a require.context directory
  }
  const seen = []
  while (true) {
    if (ownerCache.has(dir)) {
      const found = ownerCache.get(dir)
      for (const d of seen) ownerCache.set(d, found)
      return found
    }
    seen.push(dir)
    let found = null
    try {
      const manifest = path.join(dir, 'package.json')
      if (statSync(manifest).isFile()) {
        const json = JSON.parse(readFileSync(manifest, 'utf8'))
        if (typeof json.name === 'string') {
          const declared = new Set()
          for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies'])
            for (const name of Object.keys(json[field] ?? {})) declared.add(name)
          found = {
            root: dir,
            name: json.name,
            manifest: json.hozo?.manifest ?? null,
            declared: [...declared].sort(),
          }
        }
      }
    } catch {}
    const parent = path.dirname(dir)
    if (found || parent === dir) {
      for (const d of seen) ownerCache.set(d, found)
      return found
    }
    dir = parent
  }
}

const rel = (p) => path.relative(repo, p).replaceAll('\\', '/')
const duplicates = (list) => {
  const byName = new Map()
  for (const i of list) byName.set(i.name, (byName.get(i.name) ?? 0) + 1)
  return [...byName].filter(([, n]) => n > 1).map(([name, n]) => `${name} ×${n}`)
}
const manifests = (list) => list.filter((i) => i.manifest).map((i) => `${i.name} (${rel(i.root)})`)

/** closure: {roots, edges, failures, ms}; resolutions: [origin, specifier, type, file]. */
export function compare({ closure, resolutions, app, ...rest }) {
  const closed = new Map()
  for (const root of closure.roots) {
    const owner = instanceOf(path.join(root, 'package.json'))
    if (owner) closed.set(owner.root, owner)
  }
  const reached = new Map()
  const via = new Map()
  for (const [origin, specifier, type, file] of resolutions) {
    if (type !== 'sourceFile' || !file) continue
    const target = instanceOf(file)
    if (!target) continue
    reached.set(target.root, target)
    const from = instanceOf(origin)
    if (from?.root !== target.root && !via.has(target.root))
      via.set(target.root, { from: from?.name ?? null, specifier, origin })
  }
  const late = [...reached.values()].filter((i) => !closed.has(i.root))
  const lateRoots = new Set(late.map((i) => i.root))
  /** Why the closure missed an instance, judged on the first edge into it:
   * - `behind a late instance`: its importer was itself missed;
   * - `path`: imported by a relative or absolute path, not a package name;
   * - `declared, not located`: the importer declares the name, but the
   *   closure did not reach this instance through it (the bare name has no
   *   "." export, or the declaration is in devDependencies);
   * - `undeclared`: the importer imports a name it does not declare. */
  const reason = (instance) => {
    const edge = via.get(instance.root)
    if (!edge) return 'unknown'
    const from = instanceOf(edge.origin)
    if (from && lateRoots.has(from.root)) return 'behind a late instance'
    if (
      (edge.specifier.startsWith('.') || path.isAbsolute(edge.specifier)) &&
      !edge.specifier.includes('node_modules')
    )
      return 'path'
    const bare = edge.specifier
      .split('/')
      .slice(0, edge.specifier.startsWith('@') ? 2 : 1)
      .join('/')
    const json = from && JSON.parse(readFileSync(path.join(from.root, 'package.json'), 'utf8'))
    const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']
    if (json && fields.some((field) => json[field]?.[bare] !== undefined))
      return 'declared, not located'
    return 'undeclared'
  }
  return {
    app: rel(app),
    ...rest,
    resolutions: resolutions.length,
    closure: {
      instances: closed.size,
      declaredEdges: closure.edges,
      unresolvedDeclarations: closure.failures.length,
      ms: Math.round(closure.ms),
      withManifest: manifests([...closed.values()]),
      duplicateNames: duplicates([...closed.values()]).length,
    },
    reached: {
      instances: reached.size,
      withManifest: manifests([...reached.values()]),
      duplicateNames: duplicates([...reached.values()]),
    },
    closureNotReached: [...closed.keys()].filter((root) => !reached.has(root)).length,
    late: late.map((i) => ({
      name: i.name,
      root: rel(i.root),
      manifest: i.manifest,
      reason: reason(i),
      via: via.get(i.root) && {
        from: via.get(i.root).from,
        specifier:
          via.get(i.root).specifier.startsWith(path.sep) ||
          path.isAbsolute(via.get(i.root).specifier)
            ? rel(via.get(i.root).specifier)
            : via.get(i.root).specifier,
        origin: rel(via.get(i.root).origin.split('?')[0]),
      },
    })),
  }
}
