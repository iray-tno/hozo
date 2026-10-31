// Fixture driver, NOT a production dependency walker or Metro resolver. Every
// fixture exports a root-level entry, so dirname(entry) is its authored root.
import assert from 'node:assert/strict'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const root = realpathSync(process.argv[2])
const queue = [{ root, importer: path.join(root, 'App.cjs') }]
const visited = new Set()
const edges = []
while (queue.length) {
  const current = queue.shift()
  if (visited.has(current.root)) continue
  if (visited.size >= 64) throw new Error('Fixture closure budget exceeded')
  visited.add(current.root)
  const json = JSON.parse(readFileSync(path.join(current.root, 'package.json'), 'utf8'))
  for (const specifier of Object.keys(json.dependencies ?? {}).sort()) {
    const edge = { importer: current.importer, specifier }
    let entry
    try {
      entry = createRequire(current.importer).resolve(specifier)
    } catch (error) {
      edges.push({ ...edge, reason: String(error) })
      continue
    }
    const packageRoot = realpathSync(path.dirname(entry))
    const metadata = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
    assert.equal(metadata.name, specifier, 'fixture requires a root-level exported entry')
    edges.push({ ...edge, entry, packageRoot, declaredManifest: metadata.hozo?.manifest ?? null })
    queue.push({ root: packageRoot, importer: entry })
  }
}
console.log(JSON.stringify({ edges, instances: [...visited].sort() }))
