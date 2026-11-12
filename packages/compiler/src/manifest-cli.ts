#!/usr/bin/env node
// The deprecated `hozo-manifest` binary; `hozo manifest` from @hozo/cli runs
// the same function (RFC 011). Its stdout is unchanged; it adds one line on
// stderr.

import { runManifestCli } from './manifest-command.ts'

console.error('hozo-manifest is deprecated; run `hozo manifest` from @hozo/cli instead.')
process.exitCode = runManifestCli(process.argv.slice(2), process.cwd(), console, 'hozo-manifest')
