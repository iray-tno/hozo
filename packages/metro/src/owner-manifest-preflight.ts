// Dependency-declaration closure over the supplied Metro resolver. No name walk,
// JS/config evaluation or assumption that an application module graph exists.
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { readBoundedUtf8File, readResolvedOwnerManifest } from '@hozo/compiler/project'
import { METRO_OWNER_REQUEST } from './owner-manifest-transfer.ts'

export interface OwnerMetroContext {
  originModulePath: string
  getPackageForModule?(file: string): { rootPath: string; packageJson?: unknown } | null | undefined
  [key: string]: unknown
}
export type OwnerMetroResolver = (
  context: OwnerMetroContext,
  name: string,
  platform: string,
) => { type: string; filePath?: string }
interface Route {
  readonly fromRoot: string
  readonly importer: string
  readonly specifier: string
  readonly instance: string
  readonly entry: string
  readonly declaredManifest: string | null
}
type ScopeRefusal = 'no-context' | 'no-origins' | 'package-budget' | 'edge-budget'
export type MetroOwnerPreflight =
  | {
      readonly status: 'incomplete'
      readonly reason: ScopeRefusal | 'untrusted'
      readonly issues: readonly string[]
    }
  | {
      readonly status: 'complete'
      readonly platform: string
      readonly request: string
      readonly fingerprint: string
      readonly metadata: readonly { readonly file: string; readonly sha256: string }[]
      readonly routes: readonly Route[]
    }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
function fail(reason: string): never {
  throw new Error(`Metro owner preflight: ${reason}`)
}

class ScopeLimit extends Error {
  readonly reason: ScopeRefusal
  constructor(reason: ScopeRefusal) {
    super(`Metro owner preflight: ${reason}`)
    this.reason = reason
  }
}

/** @internal Recheck on config/worker adoption, never on each warm transform. */
export function assertMetroOwnerPreflightCurrent(
  value: Pick<Extract<MetroOwnerPreflight, { status: 'complete' }>, 'metadata'>,
) {
  for (const row of value.metadata)
    if (hash(readBoundedUtf8File(row.file, 65_536)) !== row.sha256)
      fail('package metadata changed; restart')
}

/** @internal Complete ONLY for the declared runtime package closure. A missing
 * optional/peer resolution is incomplete too; no absent package is guessed safe.
 * Sources are never parsed/executed. Origins and package ownership come upstream.
 */
export function collectMetroOwnerPreflight(
  context: OwnerMetroContext,
  delegate: OwnerMetroResolver,
  options: {
    platform: string
    epoch: string
    origins: readonly string[]
    /** Exact package subpaths of declared dependencies, scoped to an origin. */
    additionalImports?: readonly { importer: string; specifier: string }[]
    maxPackages?: number
    maxEdges?: number
  },
): MetroOwnerPreflight {
  const metadata = new Map<string, { file: string; sha256: string }>()
  try {
    const maxPackages = options.maxPackages ?? 128,
      maxEdges = options.maxEdges ?? 512
    if (
      options.origins.length > 128 ||
      !options.platform ||
      !options.epoch ||
      !Number.isInteger(maxPackages) ||
      maxPackages < 1 ||
      maxPackages > 128 ||
      !Number.isInteger(maxEdges) ||
      maxEdges < 1 ||
      maxEdges > 512
    )
      fail('invalid origins/platform/epoch/budget')
    if (!context.getPackageForModule) throw new ScopeLimit('no-context')
    if (!options.origins.length) throw new ScopeLimit('no-origins')
    const additional = new Map<string, Map<string, string>>()
    if ((options.additionalImports?.length ?? 0) > maxEdges) fail('additional import budget')
    const originEntries = new Set(
      options.additionalImports?.length
        ? options.origins.map((origin) => realpathSync(origin))
        : [],
    )
    for (const { importer, specifier } of options.additionalImports ?? []) {
      const origin = realpathSync(importer)
      const match = /^(@[\w.-]+\/[\w.-]+|[\w.-]+)\/([\w.-]+(?:\/[\w.-]+)*)$/.exec(specifier)
      if (
        !originEntries.has(origin) ||
        !match ||
        specifier.length > 214 ||
        match[2]!.split('/').some((segment) => segment === '.' || segment === '..')
      )
        fail('invalid additional import')
      const imports = additional.get(origin) ?? new Map<string, string>()
      if (imports.has(specifier)) fail('duplicate additional import')
      imports.set(specifier, match[1]!)
      additional.set(origin, imports)
    }
    let metadataBytes = 0
    function inspect(input: string) {
      const ownership = context.getPackageForModule!(input)
      if (!ownership || !path.isAbsolute(ownership.rootPath)) fail('package ownership unavailable')
      const checked = readResolvedOwnerManifest(
        { importer: input, specifier: 'preflight-owner' },
        {
          packageRoot: ownership.rootPath,
          entry: input,
          declaredManifest: null,
        },
      )
      if (checked.status !== 'resolved') fail('entry is not a contained filesystem source')
      const root = checked.instance,
        entry = checked.entry
      const file = path.join(root, 'package.json')
      if (!inside(root, realpathSync(file))) fail('package metadata escapes instance')
      const text = readBoundedUtf8File(file, 65_536),
        sha256 = hash(text)
      if (metadata.has(root) && metadata.get(root)!.sha256 !== sha256)
        fail('metadata changed during capture')
      if (!metadata.has(root)) metadataBytes += Buffer.byteLength(text)
      if (metadataBytes > 2_097_152) fail('metadata content budget')
      metadata.set(root, { file, sha256 })
      const json = JSON.parse(text)
      if (!json || typeof json !== 'object' || Array.isArray(json)) fail('package metadata object')
      const names = new Set<string>()
      for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        const entries = json[field]
        if (entries === undefined) continue
        if (!entries || typeof entries !== 'object' || Array.isArray(entries))
          fail('dependency declarations')
        for (const [name, version] of Object.entries(entries)) {
          if (
            !/^(?:@[\w.-]+\/)?[\w.-]+$/.test(name) ||
            name.length > 214 ||
            typeof version !== 'string'
          )
            fail('dependency declaration')
          names.add(name)
        }
      }
      if (
        json.hozo !== undefined &&
        (!json.hozo || typeof json.hozo !== 'object' || Array.isArray(json.hozo))
      )
        fail('hozo metadata object')
      const declaredManifest = json.hozo?.manifest ?? null
      if (declaredManifest !== null && typeof declaredManifest !== 'string')
        fail('manifest declaration')
      const extras = additional.get(entry)
      for (const [specifier, dependency] of extras ?? []) {
        if (!names.has(dependency)) fail('additional import requires a declared dependency')
        names.add(specifier)
      }
      return { root, entry, names: [...names].sort(), declaredManifest, extras }
    }
    const queue = options.origins.map(inspect),
      visited = new Set<string>()
    const routes = new Map<string, Route>()
    while (queue.length) {
      const current = queue.shift()!
      const id = JSON.stringify([current.root, current.entry])
      if (visited.has(id)) continue
      if (visited.size >= maxPackages) throw new ScopeLimit('package-budget')
      visited.add(id)
      for (const specifier of current.names) {
        const key = JSON.stringify([current.entry, specifier])
        if (routes.has(key)) continue
        if (routes.size >= maxEdges) throw new ScopeLimit('edge-budget')
        const resolution = delegate(
          { ...context, originModulePath: current.entry },
          specifier,
          options.platform,
        )
        if (resolution.type !== 'sourceFile' || typeof resolution.filePath !== 'string')
          fail('non-source/lazy resolution')
        const target = inspect(resolution.filePath)
        const dependency = current.extras?.get(specifier)
        if (
          dependency &&
          routes.get(JSON.stringify([current.entry, dependency]))?.instance !== target.root
        )
          fail('additional import resolved outside its dependency instance')
        routes.set(
          key,
          Object.freeze({
            fromRoot: current.root,
            importer: current.entry,
            specifier,
            instance: target.root,
            entry: target.entry,
            declaredManifest: target.declaredManifest,
          }),
        )
        queue.push(target)
      }
    }
    const ordered = [...routes]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, row]) => row)
    const request = JSON.stringify({
      schema: METRO_OWNER_REQUEST,
      platform: options.platform,
      epoch: options.epoch,
      expected: ordered.map(({ importer, specifier }) => ({ importer, specifier })),
      resolutions: ordered.map(({ importer, specifier, instance, entry, declaredManifest }) => ({
        importer,
        specifier,
        packageRoot: instance,
        entry,
        declaredManifest,
      })),
    })
    const files = [...metadata.values()]
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
      .map((row) => Object.freeze(row))
    const result = Object.freeze({
      status: 'complete' as const,
      platform: options.platform,
      request,
      fingerprint: hash(JSON.stringify(['metro-owner-preflight-0', request, files])),
      metadata: Object.freeze(files),
      routes: Object.freeze(ordered),
    })
    assertMetroOwnerPreflightCurrent(result)
    return result
  } catch (error) {
    let reason: ScopeRefusal | 'untrusted' = 'untrusted'
    let issue = error
    if (error instanceof ScopeLimit) {
      // A later budget boundary must not conceal a change to facts already
      // observed. No partially collected routes escape either outcome.
      try {
        assertMetroOwnerPreflightCurrent({ metadata: [...metadata.values()] })
        reason = error.reason
      } catch (changed) {
        issue = changed
      }
    }
    return Object.freeze({
      status: 'incomplete' as const,
      reason,
      issues: Object.freeze([String(issue).slice(0, 1000)]),
    })
  }
}
