// Puts the browser binding where the REPL page can fetch it.
//
// `public/wasm/` rather than an import: the `.wasm` is 1.3MB and the page
// asks for it on the first keystroke, so it must stay a separate file
// that the bundler does not inline or fingerprint into the entry.
//
// Missing rather than fatal. `node scripts/build-wasm.mjs` at the
// repository root needs the `wasm32-unknown-unknown` target and a
// version-matched `wasm-bindgen`, which is more than `pnpm install`
// provides -- so a contributor building the site to change a heading
// should not be stopped by it. The REPL page says so at runtime, and CI
// builds it (see `deploy-pages.yml`).

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(here, '..')
const built = path.resolve(app, '..', '..', 'packages', 'compiler', 'wasm', 'web')
const out = path.join(app, 'public', 'wasm')

rmSync(out, { recursive: true, force: true })

if (!existsSync(built)) {
  console.warn(
    'no browser binding at packages/compiler/wasm/web -- the REPL page will say so.\n' +
      '  node scripts/build-wasm.mjs',
  )
  process.exit(0)
}

mkdirSync(out, { recursive: true })
for (const file of readdirSync(built)) {
  copyFileSync(path.join(built, file), path.join(out, file))
}
console.log(`copied ${readdirSync(out).join(', ')} into public/wasm`)
