#!/usr/bin/env node

import { AuditInputError, runCli } from './index.mjs'

// Deprecated in favour of `hozo dry-fit` (RFC 011). Its stdout and JSON stay
// byte-identical to the new command's; only this line on stderr is added.
console.error('hozo-migration-audit is deprecated; run `hozo dry-fit` from @hozo/cli instead.')

try {
  const report = await runCli()
  // runCli writes evidence before returning and does not mutate its caller's
  // process. The executable alone translates the recorded policy into an exit.
  if (report?.failurePolicy?.exitCode) {
    console.error(`hozo-migration-audit: ${report.failurePolicy.reasons.join(' ')}`)
    process.exitCode = report.failurePolicy.exitCode
  }
} catch (error) {
  if (!(error instanceof AuditInputError)) throw error
  // `2`, not `1`: the audit did not run, which is not a finding (RFC 011 §3).
  console.error(`hozo-migration-audit: ${error.message} [${error.code}]`)
  process.exitCode = 2
}
