// TypeScript does not remove output for source files that no longer exist.
// That matters here because npm publishes the whole dist directory: after a
// component moves to a new owner, an ordinary `tsc -p .` can keep shipping
// the old implementation forever.

import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packages = path.join(workspace, 'packages')
const packageDirectory = path.resolve(process.cwd())
const dist = path.join(packageDirectory, 'dist')

if (path.dirname(packageDirectory) !== packages || path.basename(dist) !== 'dist') {
  throw new Error(`refusing to clean a dist directory outside ${packages}`)
}

rmSync(dist, { recursive: true, force: true })
