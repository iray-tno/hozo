// Builds `hozo_napi` for WASI and writes `@hozo/compiler-wasm32-wasi` (#1094).
// Reached through `pack-native.mjs --target wasm32-wasip1-threads`, so the
// one packing command covers every binding.
//
// Not released yet: see `WASI_TARGET` in `src/native-targets.ts`.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

import { WASI_RUNTIME_DEPENDENCIES, WASI_TARGET } from '../src/native-targets.ts'

/**
 * The emnapi release whose archive `napi-build` links, by exact tarball.
 *
 * Fetched here instead of being a devDependency. A workspace that installs
 * emnapi 2.0.0-beta.3 makes pnpm resolve every other package's optional
 * `@emnapi/*` peers to the beta too (Astro's WASI binding, across the
 * lockfile), and the point of keeping this build unreleased is that the
 * beta reaches nothing else. Integrity is npm's `dist.integrity`, so a
 * changed tarball fails the pack rather than linking something else.
 */
export const EMNAPI_ARCHIVE = {
  version: WASI_RUNTIME_DEPENDENCIES['@emnapi/core'],
  tarball: `https://registry.npmjs.org/emnapi/-/emnapi-${WASI_RUNTIME_DEPENDENCIES['@emnapi/core']}.tgz`,
  integrity:
    'sha512-Qf19h1+9LJgSYHMnQ2Us11AlAH9OaRlg9d3LBrP+4VirfbTcy3W9+muJUPFmmKx8K5kqfS58XuYY9wAJJXIAzQ==',
  // What `napi-build` links for a `-threads` target (`emnapi_link_library`).
  member: `package/lib/${WASI_TARGET.triple}/libemnapi-napi-rs-mt.a`,
}

/** One regular file from an uncompressed tar, or undefined. */
export function tarMember(tar, wanted) {
  for (let at = 0; at + 512 <= tar.length; ) {
    const header = tar.subarray(at, at + 512)
    if (header.every((byte) => byte === 0)) return undefined
    const field = (start, length) =>
      header.toString('utf8', start, start + length).replace(/\0.*$/s, '')
    const prefix = field(345, 155)
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100)
    const size = Number.parseInt(field(124, 12).trim() || '0', 8)
    const type = field(156, 1)
    at += 512
    if (name === wanted && (type === '0' || type === '')) return tar.subarray(at, at + size)
    at += Math.ceil(size / 512) * 512
  }
  return undefined
}

/** The emnapi link directory, fetched and verified once into `target/`. */
async function emnapiLinkDir(repoRoot) {
  const dir = path.join(repoRoot, 'target', 'emnapi', EMNAPI_ARCHIVE.version, WASI_TARGET.triple)
  const archive = path.join(dir, path.basename(EMNAPI_ARCHIVE.member))
  if (existsSync(archive)) return dir
  const response = await fetch(EMNAPI_ARCHIVE.tarball)
  if (!response.ok) throw new Error(`${EMNAPI_ARCHIVE.tarball}: HTTP ${response.status}`)
  const tgz = Buffer.from(await response.arrayBuffer())
  const integrity = `sha512-${createHash('sha512').update(tgz).digest('base64')}`
  if (integrity !== EMNAPI_ARCHIVE.integrity) {
    throw new Error(
      `${EMNAPI_ARCHIVE.tarball} has integrity ${integrity}, not the pinned ${EMNAPI_ARCHIVE.integrity}`,
    )
  }
  const member = tarMember(gunzipSync(tgz), EMNAPI_ARCHIVE.member)
  if (!member) throw new Error(`${EMNAPI_ARCHIVE.tarball} has no ${EMNAPI_ARCHIVE.member}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(archive, member)
  return dir
}

/**
 * The minimum, in 64 KiB pages, of the memory a `.wasm` imports.
 *
 * The loader creates that memory itself (it has to be shared), and it has to
 * be at least this large. Read from the module rather than written down,
 * because it moves with the stack size `napi-build` links with.
 */
export function wasmMemoryMinimum(bytes) {
  let at = 8 // magic and version
  const uleb = () => {
    let result = 0
    let shift = 0
    let byte
    do {
      byte = bytes[at++]
      result += (byte & 0x7f) * 2 ** shift
      shift += 7
    } while (byte & 0x80)
    return result
  }
  const name = () => {
    const length = uleb()
    at += length
  }
  while (at < bytes.length) {
    const id = bytes[at++]
    const size = uleb()
    const end = at + size
    if (id === 2) {
      const count = uleb()
      for (let i = 0; i < count; i++) {
        name()
        name()
        const kind = bytes[at++]
        if (kind === 0)
          uleb() // function: type index
        else if (kind === 1) {
          at++ // table: element type
          const flags = bytes[at++]
          uleb()
          if (flags & 1) uleb()
        } else if (kind === 2) {
          at++ // memory: limits flags; the minimum comes first either way
          return uleb()
        } else if (kind === 3)
          at += 2 // global: value type, mutability
        else throw new Error(`unknown import kind ${kind}`)
      }
    }
    at = end
  }
  throw new Error('the module imports no memory')
}

/** The loader source with the module's memory minimum written in. */
export function writeLoader(source, minimumPages) {
  const placeholder = 'const MINIMUM_PAGES = 0\n'
  if (!source.includes(placeholder))
    throw new Error('the WASI loader has no MINIMUM_PAGES = 0 to fill in')
  if (!Number.isInteger(minimumPages) || minimumPages <= 0)
    throw new Error(`not a memory minimum: ${minimumPages}`)
  return source.replace(placeholder, `const MINIMUM_PAGES = ${minimumPages}\n`)
}

export async function packWasi({ repoRoot, packageDir, outDir, version, repository }) {
  // `napi-build` links the emnapi archive from this directory and panics
  // without it. Always the pinned one, never whatever the environment says,
  // so a local build and CI link the same bytes.
  const linkDir = await emnapiLinkDir(repoRoot)

  console.log(`building ${WASI_TARGET.triple} -> ${WASI_TARGET.packageName}@${version}`)
  // The `wasm` profile is the REPL's (`opt-level = "z"`, LTO), and the trade
  // is the REPL's too: measured on 40 `@hozo/ui` sources it is half the size
  // of `release` (977 KB gzipped against 1,649 KB) for about 10% of warm
  // compile time. A WebContainer downloads the package on every fresh boot.
  execFileSync(
    'cargo',
    ['build', '--profile', 'wasm', '-p', 'hozo_napi', '--target', WASI_TARGET.triple],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, EMNAPI_LINK_DIR: linkDir },
    },
  )

  const built = path.join(repoRoot, 'target', WASI_TARGET.triple, 'wasm', 'hozo_napi.wasm')
  if (!existsSync(built)) throw new Error(`cargo reported success but ${built} does not exist`)

  const dir = path.join(outDir, WASI_TARGET.packageName.replace('@hozo/', ''))
  mkdirSync(dir, { recursive: true })
  copyFileSync(built, path.join(dir, WASI_TARGET.wasm))
  const minimumPages = wasmMemoryMinimum(readFileSync(built))
  writeFileSync(
    path.join(dir, WASI_TARGET.loader),
    writeLoader(
      readFileSync(path.join(packageDir, 'wasi', WASI_TARGET.loader), 'utf8'),
      minimumPages,
    ),
  )

  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: WASI_TARGET.packageName,
        version,
        description:
          'Compiled Hozo compiler binding for WebAssembly (WASI), for hosts no native build fits.',
        license: 'MIT',
        repository,
        main: WASI_TARGET.loader,
        files: [WASI_TARGET.wasm, WASI_TARGET.loader],
        // napi-rs's convention: npm and pnpm skip it on every machine unless
        // asked for wasm32 (`--cpu=wasm32`, or pnpm's
        // `supportedArchitectures`), so a native install never downloads it.
        cpu: ['wasm32'],
        dependencies: WASI_RUNTIME_DEPENDENCIES,
      },
      null,
      2,
    )}\n`,
  )

  writeFileSync(
    path.join(dir, 'README.md'),
    `# ${WASI_TARGET.packageName}\n\n` +
      'The Hozo compiler built for WebAssembly (WASI), for hosts that cannot load\n' +
      'a native addon, such as StackBlitz WebContainers. `@hozo/compiler` falls\n' +
      'back to it when no native package fits. Compiles are about half as fast\n' +
      'as the native build, and it does not resolve Windows paths.\n',
  )

  console.log(`wrote ${dir} (memory minimum ${minimumPages} pages)`)
}
