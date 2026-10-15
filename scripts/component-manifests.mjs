// Keeps each component package's manifest current (#950).
//
//   node scripts/component-manifests.mjs          # write
//   node scripts/component-manifests.mjs --check  # verify, exit 1 on drift
//
// A package opts in through `hozo.manifest` in its package.json, which
// `scripts/package-metadata.mjs` writes. The manifest is generated from
// source, so like the generated docs it can only ever be stale; CI checks
// it beside them. Needs the native addon.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeManifest } from '../packages/compiler/src/manifest.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

let stale = 0
for (const name of readdirSync(path.join(root, 'packages')).sort()) {
  const dir = path.join(root, 'packages', name)
  let json
  try {
    json = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    continue
  }
  if (!json.hozo?.manifest) continue
  const result = writeManifest(dir, { check })
  const shown = path.relative(root, result.file)
  if (!result.current) {
    console.error(`stale: ${shown}`)
    stale += 1
  } else {
    console.log(check ? `${shown} is current` : `wrote ${shown}`)
  }
}
if (stale > 0) {
  console.error(`\n${stale} manifest(s) out of date. Run: pnpm manifests`)
  process.exit(1)
}
