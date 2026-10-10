#!/usr/bin/env node

import { AuditInputError, runCli } from './index.mjs'

try {
  const report = await runCli()
  // runCli writes evidence before returning and does not mutate its caller's
  // process. The executable alone translates the recorded policy into an exit.
  if (report?.failurePolicy.exitCode) {
    console.error(`hozo-migration-audit: ${report.failurePolicy.reasons.join(' ')}`)
    process.exitCode = report.failurePolicy.exitCode
  }
} catch (error) {
  if (!(error instanceof AuditInputError)) throw error
  console.error(`hozo-migration-audit: ${error.message}`)
  process.exitCode = 1
}
