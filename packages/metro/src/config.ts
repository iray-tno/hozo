import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CACHE_DIR,
  StylexModuleCache,
  type HozoProjectOptions,
  type StylexResolvedBindings,
  type StylexResolutionRequest,
} from '@hozo/compiler/project'
import { DEFAULT_PRIMITIVE_SOURCES } from '@hozo/compiler/sources'

import { generateCandidateModule } from './project.ts'

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
  upstreamTransformer?: string
  css?: string
  sources?: readonly string[]
  /** Resolver-verified StyleX edges, isolated because Metro resolution is platform-aware. */
  stylexBindings?: Record<string, StylexResolvedBindings[]>
}

export const METRO_STATE_FILE = 'metro.json'

export function metroStatePath(projectRoot: string): string {
  return path.join(projectRoot, 'node_modules', '.hozo', METRO_STATE_FILE)
}

export function readMetroState(projectRoot: string): HozoMetroState | undefined {
  try {
    return JSON.parse(readFileSync(metroStatePath(projectRoot), 'utf8')) as HozoMetroState
  } catch {
    return undefined
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
  const config = await configOrPromise
  const projectRoot = path.resolve(options.root ?? config.projectRoot ?? process.cwd())
  const transformerPath = currentTransformerPath()
  const configuredUpstream = config.transformer?.babelTransformerPath
  const upstreamTransformer =
    configuredUpstream && path.resolve(configuredUpstream) !== path.resolve(transformerPath)
      ? configuredUpstream
      : undefined

  await generateCandidateModule(projectRoot, {
    css: options.css,
    content: options.content,
  })
  const state: HozoMetroState = {
    upstreamTransformer,
    css: options.css,
    sources: options.sources,
  }
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
      writeState()
    }
    return delegate(context, moduleName, platform)
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
