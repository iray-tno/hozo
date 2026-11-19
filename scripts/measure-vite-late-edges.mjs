// The Vite half of measure-metro-late-edges.mjs (#2047): an Astro app's real
// production build, with one extra Vite plugin. At buildStart, where
// @hozo/vite builds its candidate universe today, it resolves the app's
// declaration closure with Vite's own resolver; at buildEnd it reads the
// module graph the build actually produced. Each Vite build Astro runs
// (server, client) is measured separately.
//
// Usage: node scripts/measure-vite-late-edges.mjs <astro app dir>
//          [--variant declared|instances|carriers]

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import closureVariant from './late-edges-closure.cjs'
import { compare, instanceOf } from './late-edges-report.mjs'

const { declaredFields, descends, locate, variant } = closureVariant.closureVariant(
  closureVariant.variantArgument(process.argv),
)

const appRoot = path.resolve(process.argv[2] ?? 'apps/landing')
const appRequire = createRequire(path.join(appRoot, 'package.json'))
const { build } = await import(pathToFileURL(appRequire.resolve('astro')).href)

const builds = []
function measure() {
  let closure
  let started
  let resolutions = []
  return {
    name: 'hozo-measure-late-edges',
    enforce: 'pre',
    // Records each resolution by asking the rest of the chain and returning
    // its answer unchanged, so the build resolves exactly as it would.
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (importer && resolved && !resolved.external)
        resolutions.push([importer, source, 'sourceFile', resolved.id])
      return resolved
    },
    async buildStart() {
      resolutions = []
      started = performance.now()
      const t0 = performance.now()
      const roots = []
      const failures = []
      let edges = 0
      const origin = path.join(appRoot, 'package.json')
      const queue = [origin]
      const visited = new Set()
      while (queue.length) {
        const from = queue.shift()
        const owner = instanceOf(from)
        if (!owner || visited.has(owner.root)) continue
        visited.add(owner.root)
        roots.push(owner.root)
        const json = JSON.parse(readFileSync(path.join(owner.root, 'package.json'), 'utf8'))
        const names = new Set()
        if (descends(roots.length === 1, json))
          for (const field of declaredFields(roots.length === 1))
            for (const name of Object.keys(json[field] ?? {})) names.add(name)
        for (const name of [...names].sort()) {
          edges++
          // Vite throws for a package whose exports have no "." entry: only
          // its subpaths can be imported, so the name alone resolves nothing.
          const found = await locate(async (specifier) => {
            const resolved = await this.resolve(specifier, from, { skipSelf: true })
            const id = resolved?.id?.split('?')[0]
            if (!id || resolved.external || !path.isAbsolute(id))
              throw new Error(resolved ? 'external or virtual' : 'unresolved')
            return id
          }, name)
          if (found.file) queue.push(found.file)
          else failures.push({ from: owner.name, name, error: found.error })
        }
      }
      closure = { roots, edges, failures, ms: performance.now() - t0 }
    },
    buildEnd() {
      builds.push({
        environment: this.environment?.name ?? 'default',
        buildMs: performance.now() - started,
        closure,
        resolutions,
      })
    },
  }
}

// Inside the app: Astro moves prerendered files into outDir by rename, which
// cannot cross drives.
mkdirSync(path.join(appRoot, 'node_modules/.cache'), { recursive: true })
const out = mkdtempSync(path.join(appRoot, 'node_modules/.cache/hozo-late-edges-'))
process.chdir(appRoot)
try {
  await build({ root: appRoot, outDir: out, logLevel: 'silent', vite: { plugins: [measure()] } })
} finally {
  rmSync(out, { recursive: true, force: true })
}
const reports = builds.map((row) =>
  compare({
    app: appRoot,
    variant,
    environment: row.environment,
    buildMs: row.buildMs,
    closure: row.closure,
    resolutions: row.resolutions,
  }),
)
console.log(JSON.stringify(reports, null, 2))
