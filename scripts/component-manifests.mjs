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

import {
  buildManifest,
  serializeManifest,
  writeManifest,
} from '../packages/compiler/src/manifest.ts'
import { valueExports } from './generated-abi.mjs'
import { packageOwnerChannels } from './style-slots/package-owners.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** UI and patterns opt into package channels explicitly. This
 * is NOT automatic metadata for every source package or a contract audit.
 * Value exports use the existing esbuild type-erasure probe (no execution).
 * Entries need explicit named exports; star-export resolution is not claimed.
 * A single manifest cannot represent divergent platform export/text summaries,
 * so split entries must agree. Owner semantics still require independent audit.
 */
export async function sourcePackageChannels(
  dir,
  entry,
  { packageName, nativeEntry, compiledByConsumer = true } = {},
) {
  const files = globSync('src/**/*.{ts,tsx}', { cwd: dir })
    .filter((file) => !/\.(?:test|spec|stories|bench)\.[^.]+$|\.d\.ts$/.test(file))
    .sort()
  const names = await valueExports(path.resolve(dir, entry), { requireExplicit: true })
  if (nativeEntry) {
    const nativeNames = await valueExports(path.resolve(dir, nativeEntry), {
      requireExplicit: true,
    })
    if (JSON.stringify(names) !== JSON.stringify(nativeNames))
      throw new Error('Package manifest cannot merge divergent Web/Native value exports')
    if (
      serializeManifest(buildManifest({ entry: path.resolve(dir, entry) })) !==
      serializeManifest(buildManifest({ entry: path.resolve(dir, nativeEntry) }))
    )
      throw new Error('Package manifest cannot merge divergent Web/Native text summaries')
  }
  return {
    ...packageOwnerChannels(packageName, names),
    helpers: [], // No public class-joiner exports in these two packages.
    compiledByConsumer,
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
    let channels, entry
    if (json.name === '@hozo/ui') {
      entry = json.exports?.['.']
      if (typeof entry !== 'string') throw new Error('UI manifest needs its explicit source entry')
      channels = await sourcePackageChannels(dir, entry, { packageName: json.name })
    } else if (json.name === '@hozo/patterns') {
      // The package publishes dist; source summaries must not depend on stale
      // built output or guess a selected platform from package-name spelling.
      entry = './src/index.ts'
      channels = await sourcePackageChannels(dir, entry, {
        packageName: json.name,
        nativeEntry: './src/index.native.ts',
        compiledByConsumer: false,
      })
    }
    const result = writeManifest(dir, { check, entry, package: channels })
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
