// Opt-in assessment wiring. This does NOT install package candidates or facts.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CACHE_DIR, readBoundedUtf8File } from '@hozo/compiler/project'
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

type Complete = Extract<MetroOwnerPreflight, { status: 'complete' }>
export interface MetroOwnerShadowState {
  mode: 'assessment-only'
  platform: string
  context: string
  preflight: { file: string; sha256: string }
  transfer: MetroOwnerManifestReference
}
const schema = 'metro-owner-preflight-record-0'
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
): MetroOwnerShadowState {
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
    JSON.stringify(['owner-shadow-context-0', projectState, preflight.fingerprint]),
  )
  const request = JSON.parse(preflight.request)
  request.epoch = context
  const transfer = writeMetroOwnerManifestTransfer(root, JSON.stringify(request))
  assertMetroOwnerPreflightCurrent(preflight)
  return Object.freeze({
    mode: 'assessment-only',
    platform: preflight.platform,
    context,
    preflight: Object.freeze({ file, sha256 }),
    transfer,
  })
}
export function ownerShadowIdentity(state: MetroOwnerShadowState): string {
  return JSON.stringify([
    state.mode,
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
  constructor(state: MetroOwnerShadowState) {
    if (state.mode !== 'assessment-only') fail('invalid assessment mode')
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
    const key = JSON.stringify([origin ? path.resolve(origin.rootPath) : null, name])
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
  const value = new MetroOwnerShadowSession(state)
  sessions.set(slot, { identity, value })
  return value
}
