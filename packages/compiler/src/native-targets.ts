// Every platform Hozo ships a compiled binding for, as one table.
//
// The risk this exists to remove: the loader computes a package name at
// *runtime* from `process.platform`/`process.arch`, and the packer
// produces package names at *build* time from a Rust target triple. Those
// are two lists that must agree exactly, and a disagreement is invisible
// until a user on the odd platform installs a published package and is
// told no native addon could be loaded for it. `native-targets.test.ts`
// walks the table through both.
//
// The npm names are napi-rs's convention, which is worth following even
// though nothing here uses its CLI: it is what `os`/`cpu`/`libc` fields
// and every prebuild tutorial assume, so a contributor reading this
// recognises the shape.

export interface NativeTarget {
  /** Rust target triple passed to `cargo build --target`. */
  triple: string
  /** npm package name, without the version. */
  packageName: string
  /** `process.platform` this serves. */
  platform: NodeJS.Platform
  /** `process.arch` this serves. */
  arch: string
  /** Which C library, on the platform where that is a question. */
  libc?: 'gnu' | 'musl'
  /** The GitHub Actions runner that can build it. */
  runner: string
}

export const NATIVE_TARGETS: NativeTarget[] = [
  {
    triple: 'x86_64-pc-windows-msvc',
    packageName: '@hozo/compiler-win32-x64-msvc',
    platform: 'win32',
    arch: 'x64',
    runner: 'windows-latest',
  },
  {
    triple: 'aarch64-pc-windows-msvc',
    packageName: '@hozo/compiler-win32-arm64-msvc',
    platform: 'win32',
    arch: 'arm64',
    runner: 'windows-11-arm',
  },
  {
    triple: 'x86_64-apple-darwin',
    packageName: '@hozo/compiler-darwin-x64',
    platform: 'darwin',
    arch: 'x64',
    runner: 'macos-latest',
  },
  {
    triple: 'aarch64-apple-darwin',
    packageName: '@hozo/compiler-darwin-arm64',
    platform: 'darwin',
    arch: 'arm64',
    runner: 'macos-latest',
  },
  {
    triple: 'x86_64-unknown-linux-gnu',
    packageName: '@hozo/compiler-linux-x64-gnu',
    platform: 'linux',
    arch: 'x64',
    libc: 'gnu',
    runner: 'ubuntu-latest',
  },
  {
    triple: 'x86_64-unknown-linux-musl',
    packageName: '@hozo/compiler-linux-x64-musl',
    platform: 'linux',
    arch: 'x64',
    libc: 'musl',
    runner: 'ubuntu-latest',
  },
  {
    triple: 'aarch64-unknown-linux-gnu',
    packageName: '@hozo/compiler-linux-arm64-gnu',
    platform: 'linux',
    arch: 'arm64',
    libc: 'gnu',
    runner: 'ubuntu-24.04-arm',
  },
  {
    triple: 'aarch64-unknown-linux-musl',
    packageName: '@hozo/compiler-linux-arm64-musl',
    platform: 'linux',
    arch: 'arm64',
    libc: 'musl',
    runner: 'ubuntu-24.04-arm',
  },
]

/**
 * The WebAssembly build, for hosts no platform package fits (#1094).
 *
 * StackBlitz runs Node inside a WebContainer, which cannot load a native
 * addon, so without this no Hozo project opens there. It is the same
 * `hozo_napi` crate built for WASI with napi-rs's emnapi, not a second
 * binding: the API is identical, compiles are about twice as slow, and
 * Windows paths do not resolve inside its sandbox (Windows always has a
 * native package, so the loader never needs it there).
 *
 * Deliberately not in `NATIVE_TARGETS`. That table is the release matrix
 * and `@hozo/compiler`'s published optional dependencies, and this one is
 * not released yet: its link step needs emnapi v2, which is still a
 * pre-release. If emnapi v2 is not stable when 0.5.0 is cut, 0.5.0 ships
 * without it. Until then it is packed locally and exercised by CI and the
 * packed consumer only.
 */
export interface WasiTarget {
  triple: 'wasm32-wasip1-threads'
  packageName: string
  /** The file the package carries, and the loader that instantiates it. */
  wasm: string
  loader: string
}

export const WASI_TARGET: WasiTarget = {
  triple: 'wasm32-wasip1-threads',
  packageName: '@hozo/compiler-wasm32-wasi',
  wasm: 'hozo_napi.wasm',
  loader: 'hozo_napi.wasi.cjs',
}

/**
 * The emnapi and runtime versions the WASI package is built and run with.
 *
 * Exact, because they are pre-releases: `@napi-rs/wasm-runtime` 1.2.7
 * accepts `@emnapi/core` 2.0.0-beta.2 and beta.3 by name and nothing newer,
 * and a beta is allowed to change what it exports. `napi-build` 2.4.1
 * already requires emnapi v2, so v1 is not an option. Move these together,
 * and drop the pins when emnapi v2 is stable.
 */
export const WASI_RUNTIME_DEPENDENCIES = {
  '@emnapi/core': '2.0.0-beta.3',
  '@emnapi/runtime': '2.0.0-beta.3',
  '@napi-rs/wasm-runtime': '1.2.7',
} as const

/** The cdylib file extension Cargo produces on a platform. */
export function cdylibExtension(platform: NodeJS.Platform): string | undefined {
  return { win32: 'dll', darwin: 'dylib', linux: 'so' }[platform as 'win32' | 'darwin' | 'linux']
}

/**
 * The cdylib file name Cargo produces.
 *
 * Unix prefixes the crate name with `lib` and Windows doesn't, which is
 * the kind of detail that only shows up on the machine that has it.
 */
export function cdylibFileName(platform: NodeJS.Platform, crate: string): string {
  const extension = cdylibExtension(platform)
  if (!extension) throw new Error(`no cdylib extension known for platform "${platform}"`)
  return platform === 'win32' ? `${crate}.${extension}` : `lib${crate}.${extension}`
}

/** The target this machine builds by default. */
export function hostTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  libc: 'gnu' | 'musl' = 'gnu',
): NativeTarget | undefined {
  return NATIVE_TARGETS.find(
    (target) =>
      target.platform === platform &&
      target.arch === arch &&
      (target.libc === undefined || target.libc === libc),
  )
}

/** npm uses `glibc`, not the Rust triple / package suffix `gnu`. */
export function npmPlatformConstraints(target: NativeTarget) {
  return {
    os: [target.platform],
    cpu: [target.arch],
    ...(target.libc ? { libc: [target.libc === 'gnu' ? 'glibc' : 'musl'] } : {}),
  }
}

/** The manifest `@hozo/compiler` publishes, given the one it develops under. */
export function publishManifest(
  current: Record<string, unknown> & { version: string },
  // Only the packed consumer's WASI run asks for this; the release does not
  // (see `WASI_TARGET`). Under pnpm's isolated linker the compiler can only
  // resolve what it declares, so the fallback has to be declared here to be
  // reachable at all.
  options: { wasi?: boolean } = {},
): Record<string, unknown> {
  const optionalDependencies = Object.fromEntries(
    [...NATIVE_TARGETS, ...(options.wasi ? [WASI_TARGET] : [])].map((target) => [
      target.packageName,
      current.version,
    ]),
  )
  const { private: _private, ...rest } = current
  return {
    ...rest,
    // Optional is what makes the whole scheme work: npm evaluates each
    // one's `os`/`cpu`/`libc`, installs the single package that matches,
    // and skips the other seven without complaint. Required would mean
    // shipping eight binaries to everyone.
    //
    // Exact versions, not ranges. A binding is compiled from the same
    // source as the JavaScript calling it, and there is no such thing as a
    // compatible-but-different build of it.
    optionalDependencies,
  }
}
