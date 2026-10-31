import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ClassHelper } from '@hozo/compiler'
import {
  CACHE_DIR,
  type HozoProjectOptions,
  projectClassHelpers,
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
  type MetroOwnerShadowState,
  ownerShadowSession,
  prepareMetroOwnerShadow,
} from './owner-manifest-shadow.ts'

import {
  candidateModulePath,
  generateCandidateModule,
  type MetroTailwindReference,
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
  /** Explicit assessment only; no package candidates/facts installed yet. */
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

async function configureHozo<T extends MetroConfigShape>(
  configOrPromise: T | Promise<T>,
  options: HozoMetroOptions,
  ownerPreflight?: Extract<MetroOwnerPreflight, { status: 'complete' }>,
): Promise<T> {
  const config = await configOrPromise
  const projectRoot = path.resolve(options.root ?? config.projectRoot ?? process.cwd())
  if (ownerPreflight) assertMetroOwnerShadowScope(projectRoot, ownerPreflight)
  const transformerPath = currentTransformerPath()
  const configuredUpstream = config.transformer?.babelTransformerPath
  const upstreamTransformer =
    configuredUpstream && path.resolve(configuredUpstream) !== path.resolve(transformerPath)
      ? configuredUpstream
      : undefined

  const { preflight, files, tailwind } = await generateCandidateModule(projectRoot, {
    css: options.css,
    content: options.content,
    preflight: options.preflight,
    sources: options.sources,
  })
  const fontFaceCss = options.fontFaceCss?.trim()
  const fontFaceCssPath = fontFaceCss
    ? path.join(projectRoot, CACHE_DIR, 'font-faces.css')
    : undefined
  if (fontFaceCssPath) writeFileIfChanged(fontFaceCssPath, `${fontFaceCss}\n`)
  // Read once, now: a helper edited while Metro runs needs a restart, as
  // the candidate module does.
  // The candidate scan's own walk, rather than a second one.
  const foundClassHelpers = projectClassHelpers(projectRoot, files)
  const state: HozoMetroState = {
    upstreamTransformer,
    css: options.css,
    sources: options.sources,
    classHelpers: options.classHelpers,
    ...(Object.keys(foundClassHelpers).length > 0 ? { foundClassHelpers } : {}),
    preflight,
    tailwind,
    fontFaceCssPath,
    fontAvailability: options.fontAvailability,
  }
  if (ownerPreflight)
    state.ownerShadow = prepareMetroOwnerShadow(projectRoot, ownerPreflight, state)
  state.epoch = createHash('sha256').update(JSON.stringify(state)).digest('hex')
  const statePath = metroStatePath(projectRoot)
  const writeState = () => writeMetroState(statePath, state)
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
