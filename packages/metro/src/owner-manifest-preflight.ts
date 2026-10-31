// Dependency-declaration closure over the supplied Metro resolver. No name walk,
// JS/config evaluation or assumption that an application module graph exists.
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { readBoundedUtf8File, readResolvedOwnerManifest } from '@hozo/compiler/project'
import { METRO_OWNER_REQUEST } from './owner-manifest-transfer.ts'

export interface OwnerMetroContext {
  originModulePath: string
  getPackageForModule?(file: string): { rootPath: string } | null | undefined
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
export type MetroOwnerPreflight =
  | { readonly status: 'incomplete'; readonly issues: readonly string[] }
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

/** @internal Recheck on config/worker adoption, never on each warm transform. */
export function assertMetroOwnerPreflightCurrent(
  value: Extract<MetroOwnerPreflight, { status: 'complete' }>,
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
    maxPackages?: number
    maxEdges?: number
  },
): MetroOwnerPreflight {
  try {
    const maxPackages = options.maxPackages ?? 128,
      maxEdges = options.maxEdges ?? 512
    if (
      !context.getPackageForModule ||
      !options.origins.length ||
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
      fail('context/origins/budget unavailable')
    const metadata = new Map<string, { file: string; sha256: string }>()
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
      return { root, entry, names: [...names].sort(), declaredManifest }
    }
    const queue = options.origins.map(inspect),
      visited = new Set<string>()
    const routes = new Map<string, Route>()
    while (queue.length) {
      const current = queue.shift()!
      const id = JSON.stringify([current.root, current.entry])
      if (visited.has(id)) continue
      if (visited.size >= maxPackages) fail('package budget')
      visited.add(id)
      for (const specifier of current.names) {
        const key = JSON.stringify([current.entry, specifier])
        if (routes.has(key)) continue
        if (routes.size >= maxEdges) fail('edge budget')
        const resolution = delegate(
          { ...context, originModulePath: current.entry },
          specifier,
          options.platform,
        )
        if (resolution.type !== 'sourceFile' || typeof resolution.filePath !== 'string')
          fail('non-source/lazy resolution')
        const target = inspect(resolution.filePath)
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
    return Object.freeze({
      status: 'incomplete' as const,
      issues: Object.freeze([String(error).slice(0, 1000)]),
    })
  }
}
