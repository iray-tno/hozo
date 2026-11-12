// Explicit assessment or candidate-only consumption, never owner/helper/text facts.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  CACHE_DIR,
  discoverOwnerPackageCallers,
  readBoundedUtf8File,
  selectOwnerPackageContract,
} from '@hozo/compiler/project'
import {
  assertMetroOwnerPreflightCurrent,
  type MetroOwnerPreflight,
  type OwnerMetroContext,
} from './owner-manifest-preflight.ts'
import {
  type MetroOwnerManifestReference,
  MetroOwnerManifestWorker,
  writeMetroOwnerManifestTransfer,
} from './owner-manifest-transfer.ts'
import { candidateModulePath } from './project.ts'

type Complete = Extract<MetroOwnerPreflight, { status: 'complete' }>
const callerTargets = ['BottomSheet.handle', 'Toolbar.root'] as const
export type MetroOwnerCallerTarget = (typeof callerTargets)[number]
export function isMetroOwnerCallerTarget(value: unknown): value is MetroOwnerCallerTarget {
  return callerTargets.some((target) => target === value)
}
export interface MetroOwnerShadowState {
  mode: 'assessment-only' | 'candidate-consumption' | 'owner-caller-transform'
  target?: MetroOwnerCallerTarget
  platform: string
  context: string
  preflight: { file: string; sha256: string }
  transfer: MetroOwnerManifestReference
}
const schema = 'metro-owner-preflight-record-0'
const serializerAsyncRequire = 'metro-runtime/src/modules/asyncRequire'
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
function fail(reason: string): never {
  throw new Error(`[hozo] owner shadow ${reason}; restart with a fresh preflight`)
}

export function assertMetroOwnerShadowScope(root: string, preflight: Complete) {
  const metadata = path.join(realpathSync(root), 'package.json')
  if (!preflight.metadata.some((row) => row.file === metadata))
    fail('preflight excludes configured package root')
}

/** Large route/metadata data stays out of metro.json, read once per adoption. */
export function prepareMetroOwnerShadow(
  root: string,
  preflight: Complete,
  projectState: unknown,
  mode: MetroOwnerShadowState['mode'] = 'assessment-only',
  target?: MetroOwnerCallerTarget,
): MetroOwnerShadowState {
  if (mode === 'owner-caller-transform' ? !isMetroOwnerCallerTarget(target) : target !== undefined)
    fail('invalid caller target')
  assertMetroOwnerShadowScope(root, preflight)
  assertMetroOwnerPreflightCurrent(preflight)
  const body = JSON.stringify({ schema, value: preflight })
  if (Buffer.byteLength(body) > 8_388_608) fail('record budget')
  const sha256 = hash(body),
    directory = path.join(root, CACHE_DIR)
  mkdirSync(directory, { recursive: true })
  const file = path.join(directory, `owner-preflight-${sha256}.json`)
  if (existsSync(file)) {
    if (readBoundedUtf8File(file, 8_388_608) !== body) fail('immutable preflight record changed')
  } else writeFileSync(file, body, { flag: 'wx' })
  // Combine with actual configured CSS/preflight/sources/font facts, not only
  // the test/user label used while collecting the declaration closure.
  const context = hash(
    JSON.stringify([
      'owner-shadow-context-0',
      mode,
      target ?? null,
      projectState,
      preflight.fingerprint,
    ]),
  )
  const request = JSON.parse(preflight.request)
  request.epoch = context
  const transfer = writeMetroOwnerManifestTransfer(root, JSON.stringify(request))
  assertMetroOwnerPreflightCurrent(preflight)
  return Object.freeze({
    mode,
    ...(target && { target }),
    platform: preflight.platform,
    context,
    preflight: Object.freeze({ file, sha256 }),
    transfer,
  })
}
export function ownerShadowIdentity(state: MetroOwnerShadowState): string {
  return JSON.stringify([
    state.mode,
    state.target ?? null,
    state.platform,
    state.context,
    state.preflight,
    state.transfer,
  ])
}

export class MetroOwnerShadowSession {
  readonly worker: MetroOwnerManifestWorker
  #routes = new Map<string, Complete['routes'][number][]>()
  #manifests = new Map<string, string>()
  readonly #generatedOrigin?: { file: string; root: string }
  readonly #target?: MetroOwnerCallerTarget
  constructor(state: MetroOwnerShadowState, root?: string) {
    if (
      !['assessment-only', 'candidate-consumption', 'owner-caller-transform'].includes(state.mode)
    )
      fail('invalid assessment mode')
    if (
      state.mode === 'owner-caller-transform'
        ? !isMetroOwnerCallerTarget(state.target)
        : state.target !== undefined
    )
      fail('invalid caller target')
    this.#target = state.target
    const body = readBoundedUtf8File(state.preflight.file, 8_388_608)
    if (hash(body) !== state.preflight.sha256) fail('preflight record hash mismatch')
    const data = JSON.parse(body)
    if (
      data?.schema !== schema ||
      data.value?.status !== 'complete' ||
      data.value.platform !== state.platform
    )
      fail('invalid preflight record')
    const preflight = data.value as Complete
    assertMetroOwnerPreflightCurrent(preflight)
    if (root && state.mode === 'owner-caller-transform') {
      assertMetroOwnerShadowScope(root, preflight)
      const canonicalRoot = realpathSync(root)
      this.#generatedOrigin = { root: canonicalRoot, file: candidateModulePath(canonicalRoot) }
    }
    this.worker = new MetroOwnerManifestWorker(state.transfer, {
      platform: state.platform,
      epoch: state.context,
    })
    for (const instance of this.worker.contributions.instances)
      this.#manifests.set(instance.instance, instance.file)
    for (const row of preflight.routes) {
      const key = JSON.stringify([row.fromRoot, row.specifier]),
        rows = this.#routes.get(key) ?? []
      rows.push(row)
      this.#routes.set(key, rows)
    }
  }
  ownerCaller(importer: string) {
    if (!this.#target) return undefined
    const lease = this.worker.lease()
    const { requests } = discoverOwnerPackageCallers(lease, importer)
    const eligible = requests.flatMap((request) => {
      if (request.specifier !== '@hozo/patterns') return []
      const selected = selectOwnerPackageContract(lease, request)
      if (selected.status !== 'selected' || selected.identity.owner !== this.#target) return []
      return [request]
    })
    if (!eligible.length || eligible.length > 8) return undefined
    const request = eligible[0]!
    // Only public aliases on the same captured edge may share a plan. The
    // participant verifies their exact contract before collecting any IR.
    if (
      eligible.some(
        (alias) =>
          alias.importer !== request.importer ||
          alias.specifier !== request.specifier ||
          alias.entry !== request.entry ||
          alias.classProp !== request.classProp,
      )
    )
      return undefined
    return {
      lease,
      request,
      // The planner is the sole authority for actual source bindings/sites.
      // Unused captured exports acquire no recipes and cannot authorize a
      // foreign or locally shadowed binding merely by sharing its spelling.
      aliases: eligible.slice(1).map((request) => request.imported),
      disposition:
        this.#target === 'BottomSheet.handle'
          ? ('prepared-partial' as const)
          : ('prepared-literal' as const),
    }
  }
  observe(
    context: OwnerMetroContext,
    name: string,
    resolution: { type: string; filePath?: string },
  ) {
    this.worker.check()
    const origin = context.getPackageForModule?.(context.originModulePath)
    const target = resolution.filePath ? context.getPackageForModule?.(resolution.filePath) : null
    // Same-instance relative source edges introduce no new package. Assets
    // are outside the declared JS-package assessment, not participant facts.
    if (name.startsWith('.') || path.isAbsolute(name)) {
      if (
        resolution.type !== 'sourceFile' ||
        (origin && target && path.resolve(origin.rootPath) === path.resolve(target.rootPath))
      )
        return
    }
    // Metro may not assign package ownership under node_modules/.hozo.
    // Only the exact generated map may use the app's already captured
    // routes, and only for imports that the generator actually emits.
    const generated = this.#generatedOrigin
    const generatedDependency =
      generated &&
      path.resolve(context.originModulePath) === generated.file &&
      [
        '@hozo/core/generated/class-resolver',
        '@hozo/core/generated/transform-slots',
        'react-native',
      ].includes(name)
    // Metro serializes asyncRequire from the synthetic `projectRoot/.`
    // importer. Some hosts cannot attach a package owner to that spelling.
    // Grant only the already captured runtime subpath at that exact root,
    // never all bare imports made without package ownership.
    const serializerDependency =
      generated &&
      !origin &&
      name === serializerAsyncRequire &&
      context.originModulePath === `${generated.root}/.`
    const fromRoot =
      generatedDependency || serializerDependency
        ? generated.root
        : origin
          ? path.resolve(origin.rootPath)
          : null
    const key = JSON.stringify([fromRoot, name])
    const route = this.#routes
      .get(key)
      ?.find(
        (row) =>
          target &&
          resolution.type === 'sourceFile' &&
          row.instance === path.resolve(target.rootPath) &&
          row.entry === path.resolve(resolution.filePath!),
      )
    const metadata = target?.packageJson as { hozo?: { manifest?: unknown } } | undefined
    if (
      !route ||
      !metadata ||
      typeof metadata !== 'object' ||
      Array.isArray(metadata) ||
      (metadata.hozo?.manifest ?? null) !== route.declaredManifest
    ) {
      this.worker.invalidate()
      fail('unassessed or changed package resolution')
    }
    this.worker.observeResolution(route, {
      instance: route.instance,
      entry: route.entry,
      manifestFile: this.#manifests.get(route.instance) ?? null,
    })
  }
}
const sessions = new Map<string, { identity: string; value: MetroOwnerShadowSession }>()
/** One active assessment per root/platform. No warm file reads or rehashing. */
export function ownerShadowSession(
  root: string,
  state: MetroOwnerShadowState,
  platform: string,
): MetroOwnerShadowSession {
  if (platform !== state.platform) fail('platform has no preflight')
  const slot = JSON.stringify([root, platform]),
    identity = ownerShadowIdentity(state)
  const prior = sessions.get(slot)
  if (prior?.identity === identity) return prior.value
  prior?.value.worker.invalidate()
  sessions.delete(slot)
  const value = new MetroOwnerShadowSession(state, root)
  sessions.set(slot, { identity, value })
  return value
}
