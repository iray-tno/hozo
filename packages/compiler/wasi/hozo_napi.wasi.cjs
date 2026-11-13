// The entry point of `@hozo/compiler-wasm32-wasi`, copied into that package
// by `scripts/pack-native.mjs` beside `hozo_napi.wasm`.
//
// napi-rs's CLI generates a file like this one; this repository builds with
// Cargo directly (`src/native-targets.ts` says why), so it is written by
// hand, after that template. It exports exactly what `hozo_napi.node`
// exports, which is what lets `native-loader.ts` treat the two alike.
//
// CommonJS because `native-loader.ts` loads every candidate with `require`.

const { readFileSync } = require('node:fs')
const path = require('node:path')
const { WASI } = require('node:wasi')
const { getDefaultContext, instantiateNapiModuleSync } = require('@napi-rs/wasm-runtime')

const WASM = 'hozo_napi.wasm'
// The module's declared minimum, read from the `.wasm` and written here by
// `pack-native.mjs`, which refuses to pack a loader still holding 0.
const MINIMUM_PAGES = 0

// The compiler reads and writes its candidate cache by absolute path, so the
// sandbox sees the whole filesystem under the same names. On a POSIX host,
// which is what a WebContainer is, that is `/` mapped to `/`. A Windows path
// (`C:\…`) does not resolve inside WASI; Windows always has a native
// package, so the loader does not fall through to this one there.
const root = path.parse(process.cwd()).root
const wasi = new WASI({ version: 'preview1', env: process.env, preopens: { [root]: root } })

// Shared because the module is built for `wasm32-wasip1-threads`, which is
// the target napi-rs supports. The initial size is the module's own minimum
// (984 pages, 62 MiB, nearly all of it the 64 MB stack `napi-build` links
// with) rather than napi-rs's template default of 4000 pages (250 MiB),
// which a WebContainer would commit up front for no use.
const memory = new WebAssembly.Memory({ initial: MINIMUM_PAGES, maximum: 65536, shared: true })

const { napiModule } = instantiateNapiModuleSync(readFileSync(path.join(__dirname, WASM)), {
  context: getDefaultContext(),
  // The binding has no async work and starts no threads.
  asyncWorkPoolSize: 0,
  wasi,
  onCreateWorker() {
    throw new Error(
      '@hozo/compiler-wasm32-wasi: the compiler started a thread, which it never should',
    )
  },
  overwriteImports(importObject) {
    importObject.env = { ...importObject.env, ...importObject.napi, ...importObject.emnapi, memory }
    return importObject
  },
  beforeInit({ instance }) {
    for (const name of Object.keys(instance.exports)) {
      if (name.startsWith('__napi_register__')) instance.exports[name]()
    }
  },
})

module.exports = napiModule.exports
