// Dev-only build step: compiles the hozo_napi crate and copies the
// resulting native addon here as hozo_napi.node, so `src/index.ts` can
// require() it directly.
//
// The release path is `pack-native.mjs`, which builds every target and
// wraps each in its own package. This one builds the host's and puts it
// where the dev loop looks.
//
// Both ask `native-targets.ts` what the file is called, and this one did
// not until CI ran on macOS. It carried its own extension map and built
// `hozo_napi.dylib`, where a `cdylib` is `libhozo_napi.dylib` -- the
// `lib` prefix is Unix's, and Windows is the one platform without it, so
// the mistake was invisible on the machine this was written on. Cargo
// reported success and the copy then failed on a file that was never
// going to be there.
//
// One derivation, in one place, is the fix. Two of them agreeing is a
// coincidence that lasts until someone builds on a third platform.

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { cdylibFileName } from '../src/native-targets.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')

execFileSync('cargo', ['build', '-p', 'hozo_napi'], { cwd: repoRoot, stdio: 'inherit' })

const built = path.join(repoRoot, 'target', 'debug', cdylibFileName(process.platform, 'hozo_napi'))
if (!existsSync(built)) {
  throw new Error(`expected build output at ${built}, but it doesn't exist`)
}

const dest = path.join(here, '..', 'hozo_napi.node')
copyFileSync(built, dest)
console.log(`copied ${built} -> ${dest}`)
