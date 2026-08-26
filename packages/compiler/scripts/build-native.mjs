// Local build step: compiles the hozo_napi crate and copies the
// resulting native addon here as hozo_napi.node, so `src/index.ts` can
// require() it directly.
//
// The publishing path is `pack-native.mjs`, which builds every target and
// wraps each in its own package. This one builds the host's and puts it
// where the dev loop looks -- in either profile; `--release` here is about
// how fast the addon runs, not about shipping it.
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

// Debug by default, because the edit-test loop pays for the build and gets
// nothing back for it: an optimised addon rebuilds in 12.8s against 1.9s,
// and `pnpm test` takes 120s either way -- the JS suite is bound by
// TypeScript and process startup, not by how fast the compiler runs.
//
// `--release` exists for the one caller where the balance inverts. The
// conformance audit is almost entirely this addon: comparing 400 arbitrary
// candidates on Native takes 495ms debug and 63ms release, while Tailwind's
// own half of the same comparison is 11ms and does not move. See
// `build:native:release`, and the `audit` job that uses it.
const release = process.argv.includes('--release')

execFileSync('cargo', ['build', ...(release ? ['--release'] : []), '-p', 'hozo_napi'], {
  cwd: repoRoot,
  stdio: 'inherit',
})

const profile = release ? 'release' : 'debug'
const built = path.join(repoRoot, 'target', profile, cdylibFileName(process.platform, 'hozo_napi'))
if (!existsSync(built)) {
  throw new Error(`expected build output at ${built}, but it doesn't exist`)
}

const dest = path.join(here, '..', 'hozo_napi.node')
copyFileSync(built, dest)
console.log(`copied ${built} -> ${dest}`)
