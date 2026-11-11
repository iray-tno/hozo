#!/usr/bin/env node

import { EXIT, run } from './index.mjs'

try {
  process.exitCode = await run(process.argv.slice(2))
} catch (error) {
  // A command that crashed did not run either: `2`, never the `1` a CI step
  // reads as findings. The stack stays, since this is a bug to report.
  console.error(`hozo: ${error?.stack ?? error} [internal-error]`)
  process.exitCode = EXIT.error
}
