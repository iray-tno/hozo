// Builds the browser binding: `crates/hozo_wasm` to WebAssembly, then
// through `wasm-bindgen` for the JavaScript that calls it.
//
// Two targets, because the same module is wanted in two places that load
// modules differently: `web` for a page (ESM, fetches the `.wasm` beside
// it) and `nodejs` for the test that checks this binding agrees with the
// napi one.
//
// Not `wasm-pack`. It wraps exactly these two commands and adds a
// `package.json` this repository already writes for itself, and one more
// tool to install is one more thing to be the wrong version.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'packages', 'compiler', 'wasm')

// `shell: false`, and the executable named with its extension on Windows
// instead: passing arguments through a shell concatenates rather than
// escapes them, which Node deprecated for the reason it sounds like.
const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name)
const run = (command, args) => execFileSync(exe(command), args, { cwd: root, stdio: 'inherit' })

/** The version the crate pins, which `wasm-bindgen` must match exactly. */
function pinnedVersion() {
  const manifest = readFileSync(path.join(root, 'crates', 'hozo_wasm', 'Cargo.toml'), 'utf8')
  const match = /^wasm-bindgen = "=([0-9.]+)"$/m.exec(manifest)
  if (!match) throw new Error('no pinned wasm-bindgen version in crates/hozo_wasm/Cargo.toml')
  return match[1]
}

function installedVersion() {
  try {
    return execFileSync('wasm-bindgen', ['--version'], { encoding: 'utf8' }).trim().split(/\s+/)[1]
  } catch {
    return null
  }
}

const pinned = pinnedVersion()
const installed = installedVersion()

// The failure this catches is unhelpful on its own: `wasm-bindgen` reports
// a "schema version" mismatch in terms of numbers that appear in neither
// manifest, and the fix is an exact-version install.
if (installed === null) {
  console.error(
    `wasm-bindgen is not installed.\n\n  cargo install wasm-bindgen-cli --version ${pinned}\n`,
  )
  process.exit(1)
}
if (installed !== pinned) {
  console.error(
    `wasm-bindgen ${installed} is installed and the crate pins ${pinned}.\n` +
      'The two must match exactly -- the format between them is not stable.\n\n' +
      `  cargo install -f wasm-bindgen-cli --version ${pinned}\n`,
  )
  process.exit(1)
}

run('cargo', [
  'build',
  '-p',
  'hozo_wasm',
  '--target',
  'wasm32-unknown-unknown',
  '--profile',
  'wasm',
])

const wasm = path.join(root, 'target', 'wasm32-unknown-unknown', 'wasm', 'hozo_wasm.wasm')
if (!existsSync(wasm)) throw new Error(`cargo produced no ${wasm}`)

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const target of ['web', 'nodejs']) {
  run('wasm-bindgen', [
    '--target',
    target,
    '--out-dir',
    path.join(out, target),
    '--no-typescript',
    wasm,
  ])
}

// The `nodejs` target emits CommonJS, and `packages/compiler` is a module
// package -- so a bare `.js` there is read as ESM and fails on its first
// `exports`. One `package.json` says what the directory holds.
writeFileSync(
  path.join(out, 'nodejs', 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
)

// The number this whole binding is spent on. Printed rather than asserted:
// a budget nobody chose is a test that fails for the wrong reason, and the
// trade is written down in the root `Cargo.toml`.
const binary = path.join(out, 'web', 'hozo_wasm_bg.wasm')
const bytes = readFileSync(binary)
console.log(
  `\n  ${path.relative(root, binary)}` +
    `\n  raw  ${statSync(binary).size.toLocaleString()} bytes` +
    `\n  gzip ${gzipSync(bytes, { level: 9 }).length.toLocaleString()} bytes\n`,
)
