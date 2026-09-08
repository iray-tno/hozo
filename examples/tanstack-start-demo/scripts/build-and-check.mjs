// Builds into a directory of this script's own, then checks that build.
//
// `package.json` cannot do this on its own: the directory has to reach
// Vite through the environment -- Nitro owns it, not Vite, so there is no
// flag -- and `VAR=value command` is not a thing on Windows, where this
// repository is also developed.
//
// The directory is separate because `build` and `test` both run
// `vite build` and turbo starts them together: `test` depends on `^build`,
// its dependencies' builds, not its own. Sharing `.output` produced
// `EPERM: operation not permitted, unlink '.output/nitro.json'` for
// whichever task lost the race, which reads like a broken build and is
// not one (#322).

import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const output = '.output-check'

// Removed first, so a stale artifact cannot make a build that produced
// nothing look like one that worked.
rmSync(output, { recursive: true, force: true })

const env = { ...process.env, HOZO_NITRO_OUTPUT_DIR: output }
for (const [command, args] of [
  ['vite', ['build']],
  [process.execPath, ['scripts/check-build.mjs', output]],
]) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: command === 'vite', env })
  if (result.status !== 0) {
    console.error(`[tanstack-start-demo] ${command} failed with ${result.status ?? result.signal}`)
    process.exit(1)
  }
}
