// RFC 010 invariant 1 (#2044): the tables compiled into the compiler equal
// the manifests Hozo's packages ship.
//
//   node scripts/manifest-agreement.mjs   # exit 1 naming each field and entry that differ
//
// Both sides are read as they are, not as their generator meant them: the
// manifest from the package, the tables through the built native addon, by
// asking the compiler about each export. Two tables carry package facts:
//
// - the primitive mapping (`primitive_for_name`), which lowers an export of a
//   trusted primitive source by name, against `exports[].primitive`;
// - `PATTERN_HOSTS`, the pattern components that render a string child
//   inside a `View`, against `textPublish`.
//
// The catalog authors both manifest fields (`primitiveExports`, `textHosts`)
// and `PATTERN_HOSTS`; `primitive_for_name` stays the compiler's vocabulary.
// Needs the native addon.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { foreignPrimitiveNames, summarizeTextForwarding } from '../packages/compiler/src/index.ts'
import { MANIFEST_VERSION } from '../packages/compiler/src/manifest.ts'
import { DEFAULT_PRIMITIVE_SOURCES } from '../packages/compiler/src/sources.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** What the compiled-in tables say about `names`, exports of `packageName`. */
export function compiledTables(packageName, names) {
  // An import from a module on no trusted list reports exactly the names the
  // compiler would lower as primitives, had the module been trusted.
  const primitives = new Set(
    DEFAULT_PRIMITIVE_SOURCES.includes(packageName) && names.length
      ? foreignPrimitiveNames(`import { ${names.join(', ')} } from '${packageName}'`, [])
      : [],
  )
  // A component wrapping a text host is summarized; one wrapping anything
  // else is not. `hostStates` is the host's shared-state field.
  const hosts = new Map()
  for (const name of names) {
    const [probe] = summarizeTextForwarding(`import { ${name} as Host } from '${packageName}'
export function Probe({ className, ...rest }) {
  return <Host {...rest} className={className ? \`text-sm \${className}\` : 'text-sm'} />
}`).components
    if (probe) hosts.set(name, probe.hostStates)
  }
  return { primitives, hosts }
}

const shown = (value) => (value === undefined ? 'nothing' : JSON.stringify(value))

/** One line per disagreement, naming the package, the field and the entry. */
export function manifestDisagreements(
  packageName,
  manifest,
  tables = compiledTables(
    packageName,
    (manifest.exports ?? []).map((row) => row.name),
  ),
) {
  if (manifest.version !== MANIFEST_VERSION)
    return [`${packageName}: version is ${shown(manifest.version)}, not ${MANIFEST_VERSION}`]
  const found = []
  const differ = (field, entry, declared, compiled) => {
    if (declared !== compiled)
      found.push(
        `${packageName}: ${field} ${entry}: the manifest says ${shown(declared)}, the compiler ${shown(compiled)}`,
      )
  }
  for (const row of manifest.exports)
    differ(
      'exports[].primitive',
      row.name,
      row.primitive,
      tables.primitives.has(row.name) ? row.name : undefined,
    )
  const published = new Map(manifest.textPublish.map((row) => [row.name, row.sharesState]))
  for (const name of new Set([...published.keys(), ...tables.hosts.keys()]))
    differ('textPublish', name, published.get(name), tables.hosts.get(name))
  return found
}

function main() {
  let failures = 0
  for (const dir of readdirSync(path.join(root, 'packages')).sort()) {
    let json
    try {
      json = JSON.parse(readFileSync(path.join(root, 'packages', dir, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    if (!json.hozo?.manifest) continue
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'packages', dir, json.hozo.manifest), 'utf8'),
    )
    const found = manifestDisagreements(json.name, manifest)
    for (const line of found) console.error(line)
    failures += found.length
    if (!found.length) console.log(`${json.name}: manifest agrees with the compiled-in tables`)
  }
  if (failures) {
    console.error(
      `\n${failures} disagreement(s). Correct the side that is wrong. Both manifest fields and PATTERN_HOSTS are authored in scripts/style-slots/catalog.mjs: run node scripts/style-slots/generate.mjs and pnpm manifests after changing it. The primitive mapping is primitive_for_name in crates/hozo_parser/src/jsx/primitives.rs.`,
    )
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
