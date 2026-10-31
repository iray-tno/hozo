// Keeps each component package's manifest current (#950).
//
//   node scripts/component-manifests.mjs          # write
//   node scripts/component-manifests.mjs --check  # verify, exit 1 on drift
//
// A package opts in through `hozo.manifest` in its package.json, which
// `scripts/package-metadata.mjs` writes. The manifest is generated from
// source, so like the generated docs it can only ever be stale; CI checks
// it beside them. Needs the native addon.

import { globSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeManifest } from '../packages/compiler/src/manifest.ts'
import { valueExports } from './generated-abi.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** The source-shipped UI package opts into package channels explicitly. This
 * is NOT automatic metadata for every source package or a contract audit.
 * Value exports use the existing esbuild type-erasure probe (no execution).
 * UI's entry has explicit named exports; star-export resolution is not claimed.
 */
export async function sourcePackageChannels(dir, entry) {
  const files = globSync('src/**/*.{ts,tsx}', { cwd: dir })
    .filter((file) => !/\.(?:test|spec|stories)\.[^.]+$|\.d\.ts$/.test(file))
    .sort()
  return {
    exports: (await valueExports(path.resolve(dir, entry), { requireExplicit: true })).map(
      (name) => ({ name, owners: [] }),
    ),
    owners: null,
    helpers: [], // No public class-joiner export in @hozo/ui.
    compiledByConsumer: true,
    sources: files.map((file) => ({
      file: file.replaceAll('\\', '/'),
      source: readFileSync(path.join(dir, file), 'utf8'),
    })),
  }
}

async function main() {
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
    let channels
    if (json.name === '@hozo/ui') {
      const entry = json.exports?.['.']
      if (typeof entry !== 'string') throw new Error('UI manifest needs its explicit source entry')
      channels = await sourcePackageChannels(dir, entry)
    }
    const result = writeManifest(dir, { check, package: channels })
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
