// Measures whether a candidate map frozen when Metro's config loads could be
// complete for a real app (#2047, decision 012 point 4).
//
// Metro builds its candidate module when the config loads, before any module
// graph exists. The only package set it can capture then is the declaration
// closure: the app's dependencies, their dependencies, and so on, resolved
// with Metro's own resolver. This runs the app's real `expo export`, records
// every resolution the build makes (measure-metro-late-edges.preload.cjs), and
// compares the package instances the bundle reached with that closure. An
// instance the bundle reached outside the closure is a late edge: a map frozen
// at config time would not have it.
//
// Usage: node scripts/measure-metro-late-edges.mjs <expo app dir> [platform]
//          [--variant declared|instances|carriers]

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import closure from './late-edges-closure.cjs'
import { compare } from './late-edges-report.mjs'

const env = process.env
const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(process.argv[2] ?? 'examples/native-showcase')
const platform = process.argv[3]?.startsWith('--') ? 'android' : (process.argv[3] ?? 'android')
const variant = closure.closureVariant(closure.variantArgument(process.argv)).variant
const appPackage = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8'))
const appRequire = createRequire(path.join(appRoot, 'package.json'))
const cli = path.join(path.dirname(appRequire.resolve('expo/package.json')), 'bin/cli')

const work = mkdtempSync(path.join(os.tmpdir(), 'hozo-late-edges-'))
const raw = path.join(work, 'raw.json')
const started = performance.now()
let measured
try {
  execFileSync(
    process.execPath,
    [cli, 'export', '--platform', platform, '--output-dir', path.join(work, 'dist'), '--clear'],
    {
      cwd: appRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: {
        ...env,
        CI: '1',
        NODE_OPTIONS: `${env.NODE_OPTIONS ?? ''} --require ${JSON.stringify(path.join(here, 'measure-metro-late-edges.preload.cjs'))}`,
        HOZO_LATE_EDGES_OUT: raw,
        HOZO_LATE_EDGES_APP: appRoot,
        HOZO_LATE_EDGES_PLATFORM: platform,
        HOZO_LATE_EDGES_VARIANT: variant,
        HOZO_LATE_EDGES_ENTRY: appPackage.main ?? 'index.js',
      },
    },
  )
  measured = JSON.parse(readFileSync(raw, 'utf8'))
} finally {
  rmSync(work, { recursive: true, force: true })
}
const { preflight, ...report } = compare({
  app: appRoot,
  variant: measured.variant,
  platform,
  exportMs: Math.round(performance.now() - started),
  closure: measured.closure,
  resolutions: measured.resolutions,
  preflight: measured.preflight && {
    ...measured.preflight,
    ms: Math.round(measured.preflight.ms),
    issues: measured.preflight.issues.map((issue) => issue.split('\n')[0].slice(0, 300)),
  },
})
console.log(JSON.stringify({ ...report, preflight }, null, 2))
