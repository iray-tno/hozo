// Installs `@hozo/core` the way an application would -- packed, into an
// empty project, under pnpm's strict layout -- and asks whether everything
// compiled output can import resolves from there.
//
// The failure this exists for (#435): compiled output lands in application
// source, and it used to import `@hozo/primitives/runtime`,
// `@hozo/semantics/runtime` and friends. Under pnpm an application can
// resolve only what it declared, so an app holding the zero-setup facade
// could not resolve its own build. Nothing in the repository noticed,
// because a workspace resolves everything; the fixtures had quietly been
// given the owner packages as dependencies to make it work.
//
// Resolution only, deliberately: the question is whether a specifier can
// be found from where it is written, not whether its code runs, and asking
// only that needs no React, no React Native and no network. Each resolved
// file's own `@hozo/*` imports are followed in turn, under the default
// conditions and under `react-native`, so the forward from `@hozo/core`
// to the owner is checked from where it is written too.
//
//   node scripts/check-strict-install.mjs [--keep]

import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { facadedOwners, generatedLeaves, leafSpecifier } from './generated-abi.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const keep = process.argv.includes('--keep')
const work = mkdtempSync(path.join(tmpdir(), 'hozo-strict-'))
const slash = (file) => file.replaceAll('\\', '/')

function manifest(name) {
  return JSON.parse(readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8'))
}

/** `@hozo/core` and every Hozo package installing it from a registry would bring. */
function closure(name, found = new Set()) {
  if (found.has(name)) return found
  found.add(name)
  for (const dep of Object.keys(manifest(name).dependencies ?? {})) {
    if (dep.startsWith('@hozo/')) closure(dep.slice('@hozo/'.length), found)
  }
  return found
}

try {
  const packages = [...closure('core')].sort()
  const tarballDir = path.join(work, 'tarballs')
  mkdirSync(tarballDir)
  const tarballs = {}
  for (const name of packages) {
    const before = new Set(readdirSync(tarballDir))
    // `pnpm pack` rather than `npm pack`: it is what rewrites `workspace:^`
    // into the range a registry install would see.
    execSync(`pnpm pack --pack-destination "${tarballDir}"`, {
      cwd: path.join(root, 'packages', name),
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    const [file] = readdirSync(tarballDir).filter((entry) => !before.has(entry))
    if (!file) throw new Error(`pnpm pack produced nothing for @hozo/${name}`)
    tarballs[`@hozo/${name}`] = `file:${slash(path.join(tarballDir, file))}`
  }

  const app = path.join(work, 'app')
  mkdirSync(app)
  writeFileSync(
    path.join(app, 'package.json'),
    `${JSON.stringify(
      {
        name: 'hozo-strict-app',
        private: true,
        dependencies: { '@hozo/core': tarballs['@hozo/core'] },
      },
      null,
      2,
    )}\n`,
  )
  // Every Hozo package from its tarball, since none is on a registry. Peers
  // are not installed: nothing here executes, and leaving them out is what
  // keeps this offline.
  writeFileSync(
    path.join(app, 'pnpm-workspace.yaml'),
    [
      'nodeLinker: isolated',
      'autoInstallPeers: false',
      'strictPeerDependencies: false',
      'overrides:',
      ...Object.entries(tarballs).map(([name, spec]) => `  '${name}': '${spec}'`),
      '',
    ].join('\n'),
  )
  writeFileSync(path.join(app, 'index.js'), '')
  execSync('pnpm install --ignore-scripts --offline', {
    cwd: app,
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  const facaded = facadedOwners()
  const specifiers = generatedLeaves()
    .filter(({ owner }) => facaded.has(owner))
    .map((entry) => leafSpecifier(entry, facaded))
  // The control. If an undeclared owner resolves, the layout is hoisted and
  // every check below would pass for the wrong reason.
  const undeclared = packages.filter((name) => name !== 'core').map((name) => `@hozo/${name}`)

  const walker = path.join(work, 'walk.cjs')
  writeFileSync(
    walker,
    `const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const [from, specifiers, undeclared] = JSON.parse(process.argv[2])
const problems = []
for (const name of undeclared) {
  try {
    createRequire(from).resolve(name)
    problems.push(name + ' resolves from the application without being declared')
  } catch {}
}
const seen = new Set()
const queue = specifiers.map((specifier) => [from, specifier, specifier])
let resolved = 0
while (queue.length > 0) {
  const [origin, specifier, chain] = queue.shift()
  const key = origin + '\\0' + specifier
  if (seen.has(key)) continue
  seen.add(key)
  let file
  try {
    file = createRequire(origin).resolve(specifier)
  } catch (error) {
    problems.push(chain + ' does not resolve: ' + error.code)
    continue
  }
  resolved += 1
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/(?:from|import)\\s*['"](@hozo\\/[^'"]+)['"]/g)) {
    queue.push([file, match[1], chain + ' -> ' + match[1]])
  }
}
console.log(JSON.stringify({ resolved, problems }))
`,
  )

  const problems = []
  for (const conditions of [[], ['react-native']]) {
    const label = conditions.length === 0 ? 'default' : conditions.join(', ')
    const output = execFileSync(
      process.execPath,
      [
        ...conditions.map((condition) => `--conditions=${condition}`),
        walker,
        JSON.stringify([path.join(app, 'index.js'), specifiers, undeclared]),
      ],
      { encoding: 'utf8' },
    )
    const result = JSON.parse(output)
    for (const problem of result.problems) problems.push(`[${label}] ${problem}`)
    console.log(
      `${label}: ${result.resolved} modules resolved from ${specifiers.length} compiled specifiers`,
    )
  }

  if (problems.length > 0) {
    console.error(`\nan application holding only @hozo/core cannot resolve its compiled output:\n`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exitCode = 1
  } else {
    console.log(
      `strict install: @hozo/core alone resolves all ${specifiers.length} compiled specifiers`,
    )
  }
} finally {
  if (keep) console.log(`kept ${work}`)
  else rmSync(work, { recursive: true, force: true })
}
