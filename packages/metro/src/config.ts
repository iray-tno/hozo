import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ClassHelper, TextForwardingModule } from '@hozo/compiler'
import {
  CACHE_DIR,
  type CarrierClosure,
  captureCarrierClosure,
  carrierGuard,
  carrierTripMessage,
  type HozoProjectOptions,
  projectClassHelpers,
  projectTextForwarding,
  StylexModuleCache,
  type StylexResolutionRequest,
  type StylexResolvedBindings,
  writeFileIfChanged,
} from '@hozo/compiler/project'
import { DEFAULT_PRIMITIVE_SOURCES } from '@hozo/compiler/sources'
import {
  assertMetroOwnerPreflightCurrent,
  type MetroOwnerPreflight,
  type OwnerMetroContext,
} from './owner-manifest-preflight.ts'
import {
  assertMetroOwnerShadowScope,
  isMetroOwnerCallerTarget,
  type MetroOwnerCallerTarget,
  MetroOwnerShadowSession,
  type MetroOwnerShadowState,
  ownerShadowSession,
  prepareMetroOwnerShadow,
} from './owner-manifest-shadow.ts'
import {
  MetroOwnerManifestWorker,
  writeMetroOwnerManifestTransfer,
} from './owner-manifest-transfer.ts'

import {
  candidateModulePath,
  type MetroTailwindReference,
  prepareCandidateModule,
} from './project.ts'

const PROJECT_RUNTIME_MODULE = '@hozo/engine/project'

/**
 * The same options every Hozo integration takes, under this one's name.
 *
 * `root` was spelled `projectRoot` here until the four integrations were
 * lined up against each other. Metro's own config key keeps that name and
 * is still the default; the Hozo option that overrides it is `root`, the
 * same word Vite and Next use.
 */
export type HozoMetroOptions = HozoProjectOptions

interface MetroConfigShape {
  projectRoot?: string
  resolver?: Record<string, unknown> & { resolveRequest?: MetroResolveRequest }
  transformer?: Record<string, unknown> & { babelTransformerPath?: string }
  [key: string]: unknown
}

interface MetroResolution {
  type: string
  filePath?: string
  [key: string]: unknown
}

interface MetroResolutionContext {
  originModulePath: string
  getPackageForModule?: OwnerMetroContext['getPackageForModule']
  resolveRequest(
    context: MetroResolutionContext,
    moduleName: string,
    platform: string | null,
  ): MetroResolution
  [key: string]: unknown
}

type MetroResolveRequest = (
  context: MetroResolutionContext,
  moduleName: string,
  platform: string | null,
) => MetroResolution

/**
 * What the config layer has to tell the transformer.
 *
 * They are separate processes -- Metro transforms in `jest-worker`
 * subprocesses -- and the only thing they reliably share is the project
 * root, so anything configured in `metro.config.js` reaches the transform
 * through this file.
 */
export interface HozoMetroState {
  /** Explicit assessment or candidate consumption; never default owner facts. */
  ownerShadow?: MetroOwnerShadowState
  upstreamTransformer?: string
  css?: string
  sources?: readonly string[]
  /** The project's declared class-joining functions (#964). */
  classHelpers?: HozoProjectOptions['classHelpers']
  /**
   * The class helpers each file calls, found when Metro started (#964), by
   * absolute file. Found here rather than in a worker so `getCacheKey`,
   * which Metro asks for once at startup, can hash what was found.
   */
  foundClassHelpers?: Record<string, ClassHelper[]>
  /**
   * What the project's own components hand a nested `Text`, by absolute
   * importer and keyed by the specifier it wrote (RFC 012 §7.1). A
   * dependency's arrives in its manifest; a project component has none.
   * Found at startup for the same reason as `foundClassHelpers`, with the
   * same rule: a component edited while Metro runs needs a restart.
   */
  projectTextForwarding?: Record<string, TextForwardingModule[]>
  /**
   * The files those summaries were read from. `hozo square` compares them
   * with this state's time to say a running Metro holds an older one.
   */
  projectTextForwardingSources?: string[]
  /**
   * Whether the project ships a CSS reset -- `preflight` with `'auto'`
   * already resolved, here rather than in the worker on purpose.
   *
   * `'auto'` is answered by the project scan, and the scan happens once,
   * here. A worker resolving it for itself would have to scan too, and
   * two walks of a project mid-edit can disagree, which would compile one
   * half of a bundle against a reset browser and the other half against a
   * bare one (#315).
   */
  preflight?: boolean
  /** Absolute generated stylesheet imported only by Metro's Web platform. */
  fontFaceCssPath?: string
  /** Serializable font registration facts used by transformer diagnostics. */
  fontAvailability?: HozoProjectOptions['fontAvailability']
  /** Resolver-verified StyleX edges, isolated because Metro resolution is platform-aware. */
  stylexBindings?: Record<string, StylexResolvedBindings[]>
  /** Startup CSS graph and full lexical ordering seed, shared with workers. */
  tailwind?: MetroTailwindReference
  /** Config-only identity; resolver updates for another platform cannot retire it. */
  epoch?: string
  stylexRevisions?: Record<string, string>
  /** Present only for the opt-out; decision 013's route is the default. */
  nativeTextInheritance?: 'compiled'
}

export const METRO_STATE_FILE = 'metro.json'

export function metroStatePath(projectRoot: string): string {
  return path.join(projectRoot, 'node_modules', '.hozo', METRO_STATE_FILE)
}

export function readMetroState(projectRoot: string): HozoMetroState | undefined {
  try {
    return JSON.parse(readFileSync(metroStatePath(projectRoot), 'utf8')) as HozoMetroState
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined
    throw new Error('[hozo] Cannot read Metro project state; restart Metro', { cause: error })
  }
}

function currentTransformerPath(): string {
  const directory = path.dirname(fileURLToPath(import.meta.url))
  const built = path.join(directory, 'index.js')
  return existsSync(built) ? built : path.join(directory, 'index.ts')
}

function platformKey(platform: string | null): string {
  return platform ?? 'default'
}

function writeMetroState(file: string, state: HozoMetroState): boolean {
  const content = `${JSON.stringify(state, null, 2)}\n`
  try {
    if (readFileSync(file, 'utf8') === content) return false
  } catch {
    // The candidate scan has already made the state directory. A missing
    // state file is expected on the first config evaluation.
  }
  // Resolver calls can overlap transformer workers. Publish by rename so a
  // worker observes either complete resolver state, never partial JSON.
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, content)
  renameSync(temporary, file)
  return true
}

function uniqueRequests(requests: readonly StylexResolutionRequest[]): StylexResolutionRequest[] {
  const seen = new Set<string>()
  return requests.filter(({ importer, specifier }) => {
    const key = `${importer}\u0000${specifier}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function resolvedStylexBindings(
  modules: StylexModuleCache,
  requests: readonly StylexResolutionRequest[],
  resolveRequest: MetroResolveRequest,
  context: MetroResolutionContext,
  platform: string | null,
): StylexResolvedBindings[] {
  const grouped = new Map<string, StylexResolvedBindings['bindings']>()
  for (const { importer, specifier } of requests) {
    let resolution: MetroResolution
    try {
      resolution = resolveRequest({ ...context, originModulePath: importer }, specifier, platform)
    } catch {
      // An unresolved ordinary application import is not a config error. It
      // simply cannot participate in the statically indexed StyleX graph.
      continue
    }
    if (resolution.type !== 'sourceFile' || typeof resolution.filePath !== 'string') continue
    const moduleId = path.resolve(resolution.filePath)
    if (!modules.get(moduleId)) continue
    const bindings = grouped.get(importer) ?? []
    bindings.push({ specifier, moduleId })
    grouped.set(importer, bindings)
  }
  return [...grouped]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([importer, bindings]) => ({
      importer,
      bindings: bindings.sort((left, right) => left.specifier.localeCompare(right.specifier)),
    }))
}

/**
 * Adds Hozo to an existing Metro configuration without discarding the
 * transformer's other settings. The previous Babel transformer is recorded
 * as Hozo's upstream, so Expo and custom transformer chains keep working.
 */
export async function withHozo<T extends MetroConfigShape>(
  configOrPromise: T | Promise<T>,
  options: HozoMetroOptions = {},
): Promise<T> {
  return configureHozo(configOrPromise, options)
}

/** @internal Opt-in shadow harness with caller-supplied ready preflight.
 * Kept off the root entry and normal options; not a candidate support switch.
 */
export async function withHozoOwnerShadow<T extends MetroConfigShape>(
  configOrPromise: T | Promise<T>,
  preflight: MetroOwnerPreflight,
  options: HozoMetroOptions = {},
): Promise<T> {
  if (preflight.status !== 'complete') throw new Error('[hozo] owner preflight INCOMPLETE')
  assertMetroOwnerPreflightCurrent(preflight)
  return configureHozo(configOrPromise, options, preflight)
}

/** @internal Candidate-only vertical slice over a ready resolver preflight.
 * Deliberately separate from normal options and the assessment-only harness.
 * No owner contract/helper/text installation or automatic graph bootstrap.
 */
export async function withHozoOwnerCandidates<T extends MetroConfigShape>(
  configOrPromise: T | Promise<T>,
  preflight: MetroOwnerPreflight,
  options: HozoMetroOptions = {},
): Promise<T> {
  if (preflight.status !== 'complete') throw new Error('[hozo] owner preflight INCOMPLETE')
  if (preflight.platform === 'web')
    throw new Error('[hozo] Owner candidate consumption is Native-only')
  assertMetroOwnerPreflightCurrent(preflight)
  return configureHozo(configOrPromise, options, preflight, 'candidate-consumption')
}

/** @internal Bounded experimental transform, only for exact preflight callers. */
export async function withHozoPartialOwners<T extends MetroConfigShape>(
  configOrPromise: T | Promise<T>,
  preflight: MetroOwnerPreflight,
  options: HozoMetroOptions = {},
): Promise<T> {
  return withHozoOwnerCallers(configOrPromise, preflight, 'BottomSheet.handle', options)
}

/** @internal Explicit bounded owner target, not a normal option or an audit.
 * Same-edge public aliases share a plan; unassessed/mixed output stays ordinary.
 */
export async function withHozoOwnerCallers<T extends MetroConfigShape>(
  configOrPromise: T | Promise<T>,
  preflight: MetroOwnerPreflight,
  target: MetroOwnerCallerTarget,
  options: HozoMetroOptions = {},
): Promise<T> {
  if (!isMetroOwnerCallerTarget(target)) throw new Error('[hozo] Invalid owner caller target')
  if (preflight.status !== 'complete') throw new Error('[hozo] owner preflight INCOMPLETE')
  if (!['android', 'ios'].includes(preflight.platform))
    throw new Error('[hozo] Owner callers require an Android or iOS preflight')
  assertMetroOwnerPreflightCurrent(preflight)
  return configureHozo(configOrPromise, options, preflight, 'owner-caller-transform', target)
}

/** @internal Explicit fallback experiment. Choose before installing owner
 * candidates or resolver state; never recover by catching a failed build. */
export async function withHozoPartialOwnersOrOrdinary<T extends MetroConfigShape>(
  configOrPromise: T | Promise<T>,
  preflight: MetroOwnerPreflight,
  options: HozoMetroOptions = {},
) {
  if (
    preflight.status === 'incomplete' &&
    (preflight.reason === 'no-context' ||
      preflight.reason === 'no-origins' ||
      preflight.reason === 'package-budget' ||
      preflight.reason === 'edge-budget')
  ) {
    return {
      config: await withHozo(configOrPromise, options),
      admission: { route: 'ordinary-fallback', reason: preflight.reason } as const,
    }
  }
  return {
    config: await withHozoPartialOwners(configOrPromise, preflight, options),
    admission: { route: 'partial-owners' } as const,
  }
}

/**
 * The packages with a Hozo manifest this app can reach, captured once at
 * config load, before Metro has a resolver or a module graph (#2047). Their
 * manifests' candidates then stand in for scanning their sources.
 *
 * Incomplete means the ordinary route for the whole build, before anything
 * is written: the source scan, and no guard. Decision 012 point 4.
 */
function completeCarrierClosure(projectRoot: string): CarrierClosure | undefined {
  // No manifest of its own to read dependencies from: nothing to capture.
  if (!existsSync(path.join(projectRoot, 'package.json'))) return undefined
  let closure: CarrierClosure
  try {
    closure = captureCarrierClosure(projectRoot, { platform: 'native', epoch: 'metro-carriers-0' })
  } catch (error) {
    console.warn(`[hozo] package manifests not captured; scanning sources: ${error}`)
    return undefined
  }
  if (closure.contributions.status === 'complete') return closure
  console.warn(
    `[hozo] package manifests incomplete (${closure.contributions.reasons.join(', ')}); scanning sources`,
  )
  return undefined
}

async function configureHozo<T extends MetroConfigShape>(
  configOrPromise: T | Promise<T>,
  options: HozoMetroOptions,
  ownerPreflight?: Extract<MetroOwnerPreflight, { status: 'complete' }>,
  ownerMode: MetroOwnerShadowState['mode'] = 'assessment-only',
  ownerTarget?: MetroOwnerCallerTarget,
): Promise<T> {
  const config = await configOrPromise
  const textInheritance = options.nativeTextInheritance ?? 'unified'
  if (textInheritance !== 'unified' && textInheritance !== 'compiled')
    throw new Error(
      `[hozo] nativeTextInheritance must be 'unified' or 'compiled', not ${JSON.stringify(textInheritance)}`,
    )
  const projectRoot = path.resolve(options.root ?? config.projectRoot ?? process.cwd())
  if (ownerPreflight) assertMetroOwnerShadowScope(projectRoot, ownerPreflight)
  // The experimental owner paths bring their own resolver-backed capture.
  // An explicit `content.packages` already says which packages contribute
  // (`[]`: none), so it keeps the scan it names.
  const carriers =
    ownerPreflight || options.content?.packages !== undefined
      ? undefined
      : completeCarrierClosure(projectRoot)
  const guard = carriers && carrierGuard(carriers)
  const transformerPath = currentTransformerPath()
  const configuredUpstream = config.transformer?.babelTransformerPath
  const upstreamTransformer =
    configuredUpstream && path.resolve(configuredUpstream) !== path.resolve(transformerPath)
      ? configuredUpstream
      : undefined

  const initialOwners =
    ownerPreflight && ownerMode !== 'assessment-only'
      ? new MetroOwnerManifestWorker(
          writeMetroOwnerManifestTransfer(projectRoot, ownerPreflight.request),
          { platform: ownerPreflight.platform, epoch: JSON.parse(ownerPreflight.request).epoch },
        ).contributions
      : undefined
  const prepared = await prepareCandidateModule(
    projectRoot,
    {
      css: options.css,
      content: options.content,
      preflight: options.preflight,
      sources: options.sources,
      markerClasses: options.markerClasses,
    },
    initialOwners,
    carriers?.carriers.length ? carriers.contributions : undefined,
  )
  const { preflight, files, tailwind } = prepared
  const fontFaceCss = options.fontFaceCss?.trim()
  const fontFaceCssPath = fontFaceCss
    ? path.join(projectRoot, CACHE_DIR, 'font-faces.css')
    : undefined
  // Read once, now: a helper edited while Metro runs needs a restart, as
  // the candidate module does.
  // The candidate scan's own walk, rather than a second one.
  const foundClassHelpers = projectClassHelpers(projectRoot, files)
  const forwarding = projectTextForwarding(projectRoot, files)
  const state: HozoMetroState = {
    upstreamTransformer,
    css: options.css,
    sources: options.sources,
    classHelpers: options.classHelpers,
    ...(Object.keys(foundClassHelpers).length > 0 ? { foundClassHelpers } : {}),
    ...(forwarding.sources.length > 0
      ? {
          projectTextForwarding: forwarding.importers,
          projectTextForwardingSources: forwarding.sources,
        }
      : {}),
    preflight,
    tailwind,
    fontFaceCssPath,
    fontAvailability: options.fontAvailability,
    ...(textInheritance === 'compiled' ? { nativeTextInheritance: textInheritance } : {}),
  }
  if (ownerPreflight)
    state.ownerShadow = prepareMetroOwnerShadow(
      projectRoot,
      ownerPreflight,
      state,
      ownerMode,
      ownerTarget,
    )
  if (initialOwners && state.ownerShadow) {
    const fresh = new MetroOwnerShadowSession(state.ownerShadow).worker.contributions
    // Fingerprints include the context epoch, which is intentionally different
    // before/after CSS preparation. Compare the actual scoped content instead.
    if (JSON.stringify(initialOwners.instances) !== JSON.stringify(fresh.instances))
      throw new Error('[hozo] Owner candidates changed during preparation; restart Metro')
  }
  state.epoch = createHash('sha256').update(JSON.stringify(state)).digest('hex')
  const statePath = metroStatePath(projectRoot)
  const writeState = () => writeMetroState(statePath, state)
  prepared.publish()
  if (fontFaceCssPath) writeFileIfChanged(fontFaceCssPath, `${fontFaceCss}\n`)
  writeState()

  const stylexModules = new StylexModuleCache(
    path.join(projectRoot, CACHE_DIR, 'stylex-modules.json'),
  )
  const ignoredImports = new Set([
    '@stylexjs/stylex',
    ...(options.sources ?? DEFAULT_PRIMITIVE_SOURCES),
  ])
  const resolutionRequests = uniqueRequests([
    ...stylexModules.resolutionRequests(),
    ...stylexModules
      .importResolutionRequests()
      .filter(({ specifier }) => !ignoredImports.has(specifier)),
  ])
  const configuredResolveRequest = config.resolver?.resolveRequest
  const resolvedPlatforms = new Set<string>()
  const resolveRequest: MetroResolveRequest = (context, moduleName, platform) => {
    const ownerSession = state.ownerShadow
      ? ownerShadowSession(projectRoot, state.ownerShadow, platform ?? 'default')
      : undefined
    // `@hozo/engine/project` has a useful common-case fallback in the
    // published package. A configured Native build gets the exact value
    // generated for this project instead, without asking every app for a
    // provider at its root (#336).
    if (moduleName === PROJECT_RUNTIME_MODULE && platform !== 'web') {
      return { type: 'sourceFile', filePath: candidateModulePath(projectRoot) }
    }
    const delegate = configuredResolveRequest ?? context.resolveRequest
    const key = platformKey(platform)
    if (!resolvedPlatforms.has(key)) {
      resolvedPlatforms.add(key)
      const bindings = resolvedStylexBindings(
        stylexModules,
        resolutionRequests,
        delegate,
        context,
        platform,
      )
      state.stylexBindings ??= {}
      state.stylexBindings[key] = bindings
      state.stylexRevisions ??= {}
      state.stylexRevisions[key] = createHash('sha256')
        .update(JSON.stringify(bindings))
        .digest('hex')
      writeState()
    }
    const resolution = delegate(context, moduleName, platform)
    ownerSession?.observe(context, moduleName, resolution)
    if (guard && resolution.type === 'sourceFile' && resolution.filePath) {
      // Every resolution happens before `expo export` writes anything, so a
      // trip there fails the build before output. In the dev server it is a
      // restart, as a changed package set already is.
      const trip = guard(resolution.filePath)
      if (trip) throw new Error(carrierTripMessage(carriers!, trip))
    }
    return resolution
  }

  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest,
    },
    transformer: {
      ...config.transformer,
      babelTransformerPath: transformerPath,
    },
  }
}
