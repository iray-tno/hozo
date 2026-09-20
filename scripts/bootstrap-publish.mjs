// Guards the exceptional, credentialed first publish of a package or crate.
//
// Normal releases authenticate with OIDC. A registry identity has to exist
// before that trust can be configured, so this script admits exactly one
// unpublished target that the repository already declares and refuses every
// existing, private, or unknown name.
//
//   node scripts/bootstrap-publish.mjs npm @hozo/new-package
//   node scripts/bootstrap-publish.mjs crate hozo_new_crate

import { execFileSync } from 'node:child_process'
import { appendFileSync, globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { NATIVE_TARGETS } from '../packages/compiler/src/native-targets.ts'
import { PACKAGE_NAMES, VERSION } from './package-metadata.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function slash(value) {
  return value.replaceAll('\\', '/')
}

export function workspacePackages(repository = root) {
  return globSync(path.join(repository, 'packages', '*', 'package.json')).map((manifest) => ({
    manifest,
    directory: path.dirname(manifest),
    json: JSON.parse(readFileSync(manifest, 'utf8')),
  }))
}

export function resolveNpmTarget(
  name,
  packages = workspacePackages(),
  nativeTargets = NATIVE_TARGETS,
) {
  const native = nativeTargets.find((target) => target.packageName === name)
  if (native) {
    return {
      registry: 'npm',
      kind: 'native',
      name,
      version: VERSION,
      triple: native.triple,
      runner: native.runner,
      artifact: native.packageName.replace('@hozo/', ''),
      musl: native.libc === 'musl',
    }
  }

  const workspace = packages.find((entry) => entry.json.name === name)
  if (!workspace) throw new Error(`${name} is not a package declared by this repository`)
  if (workspace.json.private === true) throw new Error(`${name} is private and cannot be published`)

  const directoryName = path.basename(workspace.directory)
  if (!PACKAGE_NAMES.includes(directoryName)) {
    throw new Error(`${name} is not in the repository's generated public-package list`)
  }
  if (workspace.json.version !== VERSION) {
    throw new Error(`${name} is on ${workspace.json.version}; the release version is ${VERSION}`)
  }

  return {
    registry: 'npm',
    kind: 'workspace',
    name,
    version: workspace.json.version,
    path: slash(path.relative(root, workspace.directory)),
    runner: 'ubuntu-latest',
    musl: false,
  }
}

export function cargoMetadata(repository = root) {
  return JSON.parse(
    execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
      cwd: repository,
      encoding: 'utf8',
    }),
  )
}

export function resolveCrateTarget(name, metadata = cargoMetadata()) {
  const crate = metadata.packages.find((candidate) => candidate.name === name)
  if (!crate) throw new Error(`${name} is not a crate declared by this workspace`)
  if (Array.isArray(crate.publish) && crate.publish.length === 0) {
    throw new Error(`${name} has publish = false and cannot be published`)
  }
  if (crate.version !== VERSION) {
    throw new Error(`${name} is on ${crate.version}; the release version is ${VERSION}`)
  }

  return {
    registry: 'crate',
    kind: 'crate',
    name,
    version: crate.version,
    path: slash(path.relative(root, path.dirname(crate.manifest_path))),
    runner: 'ubuntu-latest',
    musl: false,
  }
}

export async function registryEntry(plan, fetchEntry = fetch) {
  const url =
    plan.registry === 'npm'
      ? `https://registry.npmjs.org/${encodeURIComponent(plan.name)}`
      : `https://crates.io/api/v1/crates/${encodeURIComponent(plan.name)}`
  const response = await fetchEntry(url, {
    headers: { accept: 'application/json', 'user-agent': 'hozo-bootstrap-publish' },
  })
  if (response.status === 404) return undefined
  if (!response.ok) {
    throw new Error(
      `${plan.registry} registry lookup for ${plan.name} failed with ${response.status}`,
    )
  }
  const json = await response.json()
  return plan.registry === 'npm' ? json['dist-tags']?.latest : json.crate?.max_version
}

export async function bootstrapPlan(registry, name, options = {}) {
  const plan =
    registry === 'npm'
      ? resolveNpmTarget(name, options.packages, options.nativeTargets)
      : registry === 'crate'
        ? resolveCrateTarget(name, options.metadata)
        : (() => {
            throw new Error(`registry must be "npm" or "crate", received ${registry}`)
          })()
  const existing = await registryEntry(plan, options.fetch)
  if (existing !== undefined) {
    throw new Error(
      `${name}@${existing} already exists on ${registry}; bootstrap credentials may only create names`,
    )
  }
  return plan
}

function githubOutput(plan, destination) {
  const values = {
    registry: plan.registry,
    kind: plan.kind,
    name: plan.name,
    version: plan.version,
    path: plan.path ?? '',
    triple: plan.triple ?? '',
    runner: plan.runner,
    artifact: plan.artifact ?? '',
    musl: String(plan.musl),
  }
  appendFileSync(
    destination,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [registry, name] = process.argv.slice(2)
  if (!registry || !name) {
    console.error('usage: node scripts/bootstrap-publish.mjs <npm|crate> <name>')
    process.exitCode = 2
  } else {
    try {
      const plan = await bootstrapPlan(registry, name)
      const outputAt = process.argv.indexOf('--github-output')
      if (outputAt !== -1) githubOutput(plan, process.argv[outputAt + 1])
      console.log(
        `${plan.name}@${plan.version} is an unpublished ${plan.kind} target declared by this repository`,
      )
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}
