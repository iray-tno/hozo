// Packs public workspace packages with pnpm, which replaces `workspace:`
// dependencies with publishable ranges. The resulting tarballs are published
// with npm itself so Trusted Publishing's OIDC authentication is in the path.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PACKAGE_NAMES } from './package-metadata.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function publicationOrder(names, manifests) {
  const selected = new Set(names)
  const byName = new Map(
    manifests.map((manifest) => [manifest.name.replace(/^@hozo\//, ''), manifest]),
  )
  const ordered = []
  const visiting = new Set()
  const visited = new Set()

  function visit(name) {
    if (visited.has(name)) return
    if (visiting.has(name)) throw new Error(`workspace dependency cycle reaches @hozo/${name}`)
    visiting.add(name)
    const manifest = byName.get(name)
    if (!manifest) throw new Error(`no package.json found for @hozo/${name}`)
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      const dependencyName = dependency.replace(/^@hozo\//, '')
      if (selected.has(dependencyName)) visit(dependencyName)
    }
    visiting.delete(name)
    visited.add(name)
    ordered.push(name)
  }

  for (const name of names) visit(name)
  return ordered
}

export function packArguments(name, output) {
  return ['--filter', `@hozo/${name}`, 'pack', '--out', output]
}

function runPnpm(args) {
  if (process.platform !== 'win32') {
    execFileSync('pnpm', args, { cwd: root, stdio: 'inherit' })
    return
  }
  // Node deliberately refuses to execute a .cmd shim directly. Resolve that
  // shim only to find pnpm's JavaScript entry point, then preserve the argv by
  // invoking it with Node instead of round-tripping it through a shell.
  const shim = execFileSync('where.exe', ['pnpm.cmd'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)[0]
  const entry = path.join(path.dirname(shim), 'node_modules', 'pnpm', 'bin', 'pnpm.mjs')
  execFileSync(process.execPath, [entry, ...args], { cwd: root, stdio: 'inherit' })
}

export function packPublicPackages(destination, names = PACKAGE_NAMES) {
  const absolute = path.resolve(destination)
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`pack destination must stay inside ${root}`)
  }
  rmSync(absolute, { recursive: true, force: true })
  mkdirSync(absolute, { recursive: true })
  const manifests = names.map((name) =>
    JSON.parse(readFileSync(path.join(root, 'packages', name, 'package.json'), 'utf8')),
  )
  const order = publicationOrder(names, manifests)
  const tarballs = []
  for (const name of order) {
    const manifest = manifests.find((candidate) => candidate.name === `@hozo/${name}`)
    const tarball = path.join(absolute, `hozo-${name}-${manifest.version}.tgz`)
    runPnpm(packArguments(name, tarball))
    tarballs.push(slash(path.relative(root, tarball)))
  }
  writeFileSync(path.join(absolute, 'order.txt'), `${tarballs.join('\n')}\n`)
}

function slash(value) {
  return value.replaceAll('\\', '/')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targetAt = process.argv.indexOf('--target')
  const names =
    targetAt === -1
      ? PACKAGE_NAMES
      : [process.argv[targetAt + 1]?.replace(/^@hozo\//, '')].filter(Boolean)
  if (names.length === 0 || names.some((name) => !PACKAGE_NAMES.includes(name))) {
    console.error('target is not a public @hozo workspace package')
    process.exit(1)
  }
  const destinationAt = process.argv.indexOf('--destination')
  const destination =
    destinationAt === -1 ? path.join(root, 'artifacts', 'npm') : process.argv[destinationAt + 1]
  packPublicPackages(destination, names)
}
