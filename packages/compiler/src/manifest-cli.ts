#!/usr/bin/env node
// hozo-manifest [package-dir] [--entry <file>] [--check]
//
// Writes the package's manifest where its package.json's `hozo.manifest`
// says (default `hozo.manifest.json`), or with --check, exits 1 when the
// file is not what the source says. See `./manifest.ts`.

import path from 'node:path'

import { writeManifest } from './manifest.ts'

const args = process.argv.slice(2)
const check = args.includes('--check')
const entryAt = args.indexOf('--entry')
const entry = entryAt >= 0 ? args[entryAt + 1] : undefined
const positional = args.filter(
  (arg, index) => !arg.startsWith('--') && (entryAt < 0 || index !== entryAt + 1),
)
const packageDir = path.resolve(positional[0] ?? '.')

const result = writeManifest(packageDir, { check, entry })
const shown = path.relative(process.cwd(), result.file)
if (!result.current) {
  console.error(
    `${shown} is out of date. Run: hozo-manifest ${path.relative(process.cwd(), packageDir) || '.'}`,
  )
  process.exit(1)
}
console.log(check ? `${shown} is current` : `wrote ${shown}`)
