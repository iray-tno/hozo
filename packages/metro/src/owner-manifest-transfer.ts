// Explicit shadow startup/worker protocol. withHozo does not enable it yet.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  CACHE_DIR,
  captureOwnerManifests,
  collectOwnerPackageContributions,
  type OwnerImportEdge,
  type OwnerManifestCapture,
  OwnerManifestEpoch,
  type OwnerPackageContributions,
  readBoundedUtf8File,
  readResolvedOwnerManifest,
} from '@hozo/compiler/project'

export const METRO_OWNER_REQUEST = 'rfc010-metro-owner-request-0'
const schema = 'rfc010-metro-owner-transfer-0'
const limit = 8_388_608
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const edgeKey = (edge: OwnerImportEdge) => JSON.stringify([edge.importer, edge.specifier])
function fail(reason: string): never {
  throw new Error(`[hozo] Metro owner ${reason}; restart with a fresh capture`)
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid data')
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== keys.length || !keys.every((key) => Object.hasOwn(row, key)))
    fail('invalid fields')
  return row
}
function decode(text: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > limit) fail('size budget')
  try {
    return JSON.parse(text)
  } catch {
    return fail('invalid JSON')
  }
}
function bounded(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
    fail('invalid identity')
  return value
}
function request(input: unknown) {
  const value = object(input, ['schema', 'platform', 'epoch', 'expected', 'resolutions'])
  if (
    value.schema !== METRO_OWNER_REQUEST ||
    !Array.isArray(value.expected) ||
    value.expected.length > 512 ||
    !Array.isArray(value.resolutions) ||
    value.resolutions.length > 1024
  )
    fail('request schema/budget')
  const platform = bounded(value.platform),
    epoch = bounded(value.epoch)
  const expected = value.expected.map((value) => {
    const row = object(value, ['importer', 'specifier'])
    return { importer: bounded(row.importer), specifier: bounded(row.specifier) }
  })
  const resolutions = value.resolutions.map((value) => {
    const row = object(value, ['importer', 'specifier', 'packageRoot', 'entry', 'declaredManifest'])
    return {
      importer: bounded(row.importer),
      specifier: bounded(row.specifier),
      packageRoot: bounded(row.packageRoot),
      entry: bounded(row.entry),
      declaredManifest: row.declaredManifest === null ? null : bounded(row.declaredManifest),
    }
  })
  return { schema: METRO_OWNER_REQUEST, platform, epoch, expected, resolutions }
}
function capture(input: ReturnType<typeof request>) {
  // Retain resolver-supplied declaration paths, not just canonical targets:
  // symlink/declaration replacement between config and worker must be visible.
  const observed = input.resolutions.map((row) => readResolvedOwnerManifest(row, row))
  const captured = captureOwnerManifests(input.expected, observed, input)
  const contributions = collectOwnerPackageContributions(captured)
  if (captured.status !== 'complete' || contributions.status !== 'complete')
    fail('capture INCOMPLETE')
  return { capture: captured, contributions }
}
export interface MetroOwnerManifestReference {
  readonly file: string
  readonly sha256: string
  readonly captureFingerprint: string
  readonly contributionFingerprint: string
}

/** @internal Freeze a supplied resolver preflight BEFORE candidate-map use.
 * This does not discover the closure or give Metro a graph at config time.
 */
export function writeMetroOwnerManifestTransfer(
  root: string,
  input: string,
): MetroOwnerManifestReference {
  if (!path.isAbsolute(root)) fail('project root must be absolute')
  const seed = request(decode(input)),
    result = capture(seed)
  const body = JSON.stringify({
    schema,
    request: seed,
    captureFingerprint: result.capture.fingerprint,
    contributionFingerprint: result.contributions.fingerprint,
  })
  if (Buffer.byteLength(body) > limit) fail('size budget')
  const sha256 = hash(body),
    directory = path.join(root, CACHE_DIR)
  const file = path.join(directory, `owner-${sha256}.json`)
  mkdirSync(directory, { recursive: true })
  if (existsSync(file)) {
    if (readBoundedUtf8File(file, limit) !== body) fail('immutable transfer changed')
  } else writeFileSync(file, body, { flag: 'wx' })
  return Object.freeze({
    file,
    sha256,
    captureFingerprint: result.capture.fingerprint,
    contributionFingerprint: result.contributions.fingerprint,
  })
}

function restore(
  reference: MetroOwnerManifestReference,
  expected: { platform: string; epoch: string },
): {
  capture: Extract<OwnerManifestCapture, { status: 'complete' }>
  contributions: Extract<OwnerPackageContributions, { status: 'complete' }>
} {
  const body = readBoundedUtf8File(reference.file, limit)
  if (hash(body) !== reference.sha256) fail('transfer hash mismatch')
  const data = object(decode(body), [
    'schema',
    'request',
    'captureFingerprint',
    'contributionFingerprint',
  ])
  if (
    data.schema !== schema ||
    data.captureFingerprint !== reference.captureFingerprint ||
    data.contributionFingerprint !== reference.contributionFingerprint
  )
    fail('transfer identity mismatch')
  const seed = request(data.request)
  if (seed.platform !== expected.platform || seed.epoch !== expected.epoch)
    fail('platform/context mismatch')
  const result = capture(seed)
  if (
    result.capture.fingerprint !== reference.captureFingerprint ||
    result.contributions.fingerprint !== reference.contributionFingerprint
  )
    fail('source bytes changed')
  return result
}

/** @internal One worker's startup snapshot. No filesystem polling or candidate
 * union growth during transforms. Canonical resolution observations must be
 * supplied by the actual resolver; unknown/changed edges require restart.
 */
export class MetroOwnerManifestWorker {
  readonly contributions: ReturnType<typeof restore>['contributions']
  readonly cacheKey: string
  #epoch = new OwnerManifestEpoch()
  #edges = new Map<string, string>()
  constructor(
    reference: MetroOwnerManifestReference,
    context: { platform: string; epoch: string },
  ) {
    const result = restore(reference, context)
    this.#epoch.adopt(result.capture)
    this.contributions = result.contributions
    this.cacheKey = hash(
      JSON.stringify([
        schema,
        reference.sha256,
        reference.captureFingerprint,
        reference.contributionFingerprint,
        context.platform,
        context.epoch,
      ]),
    )
    for (const row of result.capture.bindings)
      this.#edges.set(
        edgeKey(row),
        JSON.stringify([row.instance, row.entry, row.manifest?.file ?? null]),
      )
    Object.freeze(this)
  }
  observeResolution(
    edge: OwnerImportEdge,
    resolved: { instance: string; entry: string; manifestFile: string | null },
  ) {
    this.#epoch.lease().check()
    if (
      this.#edges.get(edgeKey(edge)) !==
      JSON.stringify([resolved.instance, resolved.entry, resolved.manifestFile])
    ) {
      this.#epoch.invalidate()
      fail('resolution changed or arrived late')
    }
  }
  run<T>(calculate: (contributions: MetroOwnerManifestWorker['contributions']) => T | Promise<T>) {
    return this.#epoch.run(() => calculate(this.contributions))
  }
  invalidate() {
    this.#epoch.invalidate()
  }
}
