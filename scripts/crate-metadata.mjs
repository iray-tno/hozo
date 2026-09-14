// Keeps the Rust workspace on the npm packages' version.
//
// Hozo publishes its library crates and its `@hozo/*` packages from one
// tag, as one release. Changesets owns the npm version (see
// `package-metadata.mjs`); this writes that version into `Cargo.toml` --
// the workspace version, and the version every internal dependency carries
// beside its path, which `cargo publish` requires.
//
//   node scripts/crate-metadata.mjs          # write
//   node scripts/crate-metadata.mjs --check  # verify, exit 1 on drift

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { VERSION } from './package-metadata.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = path.join(root, 'Cargo.toml')

/** `Cargo.toml` as it should read for `version`. */
export function expectedManifest(text, version = VERSION) {
  const lines = text.split('\n')
  let section = ''
  let replaced = 0
  const next = lines.map((line) => {
    const header = /^\[([^\]]+)\]\s*$/.exec(line)
    if (header) {
      section = header[1]
      return line
    }
    if (section === 'workspace.package' && /^version = "[^"]*"$/.test(line)) {
      replaced += 1
      return `version = "${version}"`
    }
    if (
      section === 'workspace.dependencies' &&
      /^hozo_\w+ = \{.*version = "[^"]*".*\}$/.test(line)
    ) {
      replaced += 1
      return line.replace(/version = "[^"]*"/, `version = "${version}"`)
    }
    return line
  })
  // One for the workspace, and at least one internal dependency. Fewer means
  // the manifest changed shape under this script, and it would otherwise
  // report "current" while checking nothing.
  if (replaced < 2) {
    throw new Error('Cargo.toml has no [workspace.package] version or no internal dependencies')
  }
  return next.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const current = readFileSync(manifest, 'utf8')
  const expected = expectedManifest(current)
  if (process.argv.includes('--check')) {
    if (current !== expected) {
      console.error(
        `Cargo.toml is not on version ${VERSION} -- rerun node scripts/crate-metadata.mjs`,
      )
      process.exit(1)
    }
    console.log(`crates are on ${VERSION}`)
  } else {
    writeFileSync(manifest, expected)
    console.log(`crates set to ${VERSION}`)
  }
}
