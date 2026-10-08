#!/usr/bin/env node

import { AuditInputError, runCli } from './index.mjs'

try {
  await runCli()
} catch (error) {
  if (!(error instanceof AuditInputError)) throw error
  console.error(`hozo-migration-audit: ${error.message}`)
  process.exitCode = 1
}
