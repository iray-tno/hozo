// A package's manifest: facts about its components that a caller's build
// needs and cannot see, because it compiles the caller's file alone (#950).
//
// The direction is recorded on #656. A package computes these from its own
// source and ships them, the way it ships `.d.ts` files, so a caller's build
// reads them without reading the source. They change only when the package
// does, so nothing has to be invalidated -- the property Metro needs, since
// it has no way to re-transform a caller when a file the caller depends on
// changes.
//
// Layered so the requirements that will grow land at the edges: the
// summary is computed in memory (`summarizeTextForwarding`), a manifest is
// assembled in memory (`buildManifest`), and only `writeManifest` and the
// CLI touch the file system.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { globSync } from 'tinyglobby'
import { buildPackageManifest, type PackageManifestOptions } from './package-manifest.ts'

export type { HozoPackageManifest } from './owner-package.ts'
export { buildPackageManifest, type PackageManifestOptions } from './package-manifest.ts'

import {
  summarizeTextForwarding,
  type TextForwardingComponent,
  type TextForwardingModule,
  type TextForwardingSummary,
} from './index.ts'

/** Bumped when a reader could misread an older or newer manifest. Version 2
 * adds RFC 010's package channels beside `textForwarding` (#2044). */
export const MANIFEST_VERSION = 2

/** A manifest holding only `textForwarding`, as `buildManifest` and the
 * `hozo-manifest` command write it. Still read, so a package that ships one
 * keeps working. */
export const TEXT_MANIFEST_VERSION = 1

const READABLE_VERSIONS: readonly number[] = [TEXT_MANIFEST_VERSION, MANIFEST_VERSION]

/** The file a package names in `package.json`'s `hozo.manifest`. */
export const DEFAULT_MANIFEST_FILE = 'hozo.manifest.json'

/** What a component hands its children as text styles, by prop value. */
export interface TextForwardingEntry {
  props: { name: string; default?: string; values: string[] }[]
  /** One per combination of `props`; `when` holds a value for each, in order. */
  variants: { when: string[]; classes: string }[]
  /** The component prop that drives the `disabled:` classes, if any. */
  disabledProp?: string
  /**
   * Whether the host shares its pressed, hovered and focused state with a
   * Text inside it, so the `hover:`, `active:` and `focus-visible:` classes
   * reach a caller's Text too (#974). Absent means it does not.
   */
  hostStates?: true
}

export interface HozoManifest {
  version: number
  /**
   * Keyed by the name a caller imports from the package's entry. A new kind
   * of fact gets a key of its own beside this one.
   */
  textForwarding: Record<string, TextForwardingEntry>
}

export interface BuildManifestOptions {
  /** The package's entry module, absolute. */
  entry: string
  /** Defaults to reading the file system; a caller can serve memory instead. */
  readSource?: (file: string) => string | undefined
  /**
   * Each file's text-forwarding summary, `undefined` for no such file, in
   * place of reading and summarising it here: a project's per-file records
   * already hold it (decision 014).
   */
  summarize?: (file: string) => TextForwardingSummary | undefined
}

const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js']

function readFromDisk(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

function resolveRelative(
  from: string,
  specifier: string,
  summarize: (file: string) => TextForwardingSummary | undefined,
): { file: string; summary: TextForwardingSummary } | undefined {
  const base = path.resolve(path.dirname(from), specifier)
  const candidates = [
    base,
    ...EXTENSIONS.map((extension) => base + extension),
    ...EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ]
  for (const file of candidates) {
    const summary = summarize(file)
    if (summary !== undefined) return { file, summary }
  }
  return undefined
}

function toEntry(component: TextForwardingComponent): TextForwardingEntry {
  return {
    props: component.props.map((prop) => ({
      name: prop.name,
      ...(prop.default !== undefined && prop.default !== null ? { default: prop.default } : {}),
      values: prop.values,
    })),
    variants: component.variants.map((variant) => ({
      when: variant.when,
      classes: variant.classes,
    })),
    ...(component.disabledProp ? { disabledProp: component.disabledProp } : {}),
    ...(component.hostStates ? { hostStates: true as const } : {}),
  }
}

/**
 * The manifest for the package whose entry is `options.entry`.
 *
 * Follows relative re-exports from the entry to the files that define each
 * component. A bare specifier is another package's business and is left
 * alone: that package ships its own manifest.
 */
export function buildManifest(options: BuildManifestOptions): HozoManifest {
  const read = options.readSource ?? readFromDisk
  const summarize =
    options.summarize ??
    ((file: string) => {
      const source = read(file)
      return source === undefined ? undefined : summarizeTextForwarding(source)
    })
  const textForwarding: Record<string, TextForwardingEntry> = {}

  // Each name `file` exports, mapped to the names the entry publishes it
  // under -- one component can be published twice, as `HozoButton` and as
  // `Button`. `undefined` means every name, as itself: the entry.
  type Wanted = Map<string, string[]> | undefined
  const publishedAs = (wanted: Wanted, name: string) => (wanted ? (wanted.get(name) ?? []) : [name])
  const visit = (
    file: string,
    summary: TextForwardingSummary,
    wanted: Wanted,
    seen: Set<string>,
  ) => {
    const key = `${file}\u0000${wanted ? JSON.stringify([...wanted]) : '*'}`
    if (seen.has(key)) return
    seen.add(key)
    for (const component of summary.components) {
      for (const as of publishedAs(wanted, component.name)) textForwarding[as] = toEntry(component)
    }
    const next = new Map<string, Map<string, string[]>>()
    for (const reexport of summary.reexports) {
      if (!reexport.specifier.startsWith('.')) continue
      const names = next.get(reexport.specifier) ?? new Map<string, string[]>()
      for (const as of publishedAs(wanted, reexport.exported)) {
        names.set(reexport.imported, [...(names.get(reexport.imported) ?? []), as])
      }
      if (names.size > 0) next.set(reexport.specifier, names)
    }
    for (const [specifier, names] of next) {
      const target = resolveRelative(file, specifier, summarize)
      if (target) visit(target.file, target.summary, names, seen)
    }
  }

  const entry = summarize(options.entry)
  if (entry === undefined) throw new Error(`hozo manifest: cannot read ${options.entry}`)
  visit(options.entry, entry, undefined, new Set())

  const sorted: Record<string, TextForwardingEntry> = {}
  for (const [name, entry] of Object.entries(textForwarding).sort(([a], [b]) => (a < b ? -1 : 1))) {
    sorted[name] = entry
  }
  return { version: TEXT_MANIFEST_VERSION, textForwarding: sorted }
}

/**
 * A manifest's text forwarding in the shape `Compiler.setTextForwarding`
 * takes, for the components callers import from `module`.
 *
 * Versions 1 and 2 store `textForwarding` the same way. A manifest of any
 * other version is not read: its fields may not mean what this reader
 * thinks, and reading nothing leaves the caller compiling as it did without
 * one.
 */
export function textForwardingModule(module: string, manifest: HozoManifest): TextForwardingModule {
  if (!READABLE_VERSIONS.includes(manifest.version)) return { module, components: [] }
  return {
    module,
    components: Object.entries(manifest.textForwarding ?? {}).map(([name, entry]) => ({
      name,
      props: entry.props,
      variants: entry.variants,
      disabledProp: entry.disabledProp,
      hostStates: entry.hostStates === true,
    })),
  }
}

/** The manifest as it is written: stable, so a check can compare text. */
export function serializeManifest(manifest: HozoManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

interface PackageJson {
  main?: string
  exports?: unknown
  hozo?: { manifest?: string }
}

function packageEntry(json: PackageJson): string | undefined {
  const dot =
    typeof json.exports === 'string'
      ? json.exports
      : json.exports && typeof json.exports === 'object'
        ? (json.exports as Record<string, unknown>)['.']
        : undefined
  if (typeof dot === 'string') return dot
  if (dot && typeof dot === 'object') {
    const conditions = dot as Record<string, unknown>
    for (const condition of ['source', 'import', 'default']) {
      if (typeof conditions[condition] === 'string') return conditions[condition] as string
    }
  }
  return json.main
}

/** What a package author states for a version 2 manifest from `hozo manifest`. */
export interface ManifestCandidateOptions {
  /** Globs, relative to the package, naming the files its candidates come from. */
  sources: readonly string[]
  /** Whether the consumer compiles those files, rather than built output. */
  compiledByConsumer: boolean
}

// Not the package's own classes, and a test can list ones no consumer uses.
const NOT_PACKAGE_SOURCE = /\.(?:test|spec|stories|bench)\.[^./]+$|\.d\.[cm]?ts$/

/**
 * The package channels a third-party package can state without Hozo's
 * style-slot catalog: candidates from the named sources, and nothing that
 * needs an audit. No owner contracts, no class joiners and no text
 * publication, so `exports` only has to name what `textForwarding` keys on;
 * the reader uses the rest of `exports` for owner contracts alone.
 */
export function authoredPackageChannels(
  packageDir: string,
  text: HozoManifest,
  options: ManifestCandidateOptions,
): PackageManifestOptions {
  if (!options.sources.length) throw new Error('hozo manifest: --sources names no files')
  const files = globSync([...options.sources], {
    cwd: packageDir,
    ignore: ['**/node_modules/**'],
    onlyFiles: true,
  })
    .filter((file) => !NOT_PACKAGE_SOURCE.test(file))
    .map((file) => file.replaceAll('\\', '/'))
    .sort()
  if (!files.length)
    throw new Error(`hozo manifest: --sources ${options.sources.join(' ')} matched no files`)
  return {
    exports: Object.keys(text.textForwarding).map((name) => ({ name, owners: [] })),
    owners: null,
    helpers: [],
    compiledByConsumer: options.compiledByConsumer,
    sources: files.map((file) => ({
      file,
      source: readFileSync(path.join(packageDir, file), 'utf8'),
    })),
  }
}

export interface PackageManifestResult {
  file: string
  text: string
  /** False when `check` was set and the file on disk differs. */
  current: boolean
}

/**
 * Builds the manifest for the package in `packageDir` and writes it where
 * its `package.json` says, or checks that what is there is current.
 */
export function writeManifest(
  packageDir: string,
  options: {
    check?: boolean
    /**
     * The source entry, relative to `packageDir`. Needed when the package's
     * published entry is built output, which has no JSX left to read.
     */
    entry?: string
    /** Opt-in bounded RFC010 package channels; legacy callers are unchanged. */
    package?: PackageManifestOptions
    /** Version 2 from the author's own statement, as `hozo manifest --sources`. */
    candidates?: ManifestCandidateOptions
  } = {},
): PackageManifestResult {
  const json = JSON.parse(
    readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
  ) as PackageJson
  const entry = options.entry ?? packageEntry(json)
  if (!entry) throw new Error(`hozo manifest: ${packageDir}/package.json names no entry`)
  const file = path.join(packageDir, json.hozo?.manifest ?? DEFAULT_MANIFEST_FILE)
  const legacy = buildManifest({ entry: path.join(packageDir, entry) })
  if (options.package && options.candidates)
    throw new Error('hozo manifest: package channels are given twice')
  const channels =
    options.package ??
    (options.candidates && authoredPackageChannels(packageDir, legacy, options.candidates))
  const text = serializeManifest(channels ? buildPackageManifest(legacy, channels) : legacy)
  if (options.check) return { file, text, current: readFromDisk(file) === text }
  writeFileSync(file, text)
  return { file, text, current: true }
}

/**
 * The text forwarding of every direct dependency that ships a manifest,
 * read from `node_modules` the way the project resolves it.
 *
 * Read fresh, not cached: a manifest is a file inside an installed package,
 * so it changes only when the install does. `key` names what was read, for
 * a bundler whose cache has to change when it does -- Metro's, which keys a
 * transform on the file and the transformer and not on what the transformer
 * read from elsewhere.
 *
 * Only direct dependencies: a caller imports a component from a package it
 * depends on, so a manifest further down the tree is never consulted.
 */
export function dependencyTextForwarding(projectRoot: string): {
  modules: TextForwardingModule[]
  key: string
} {
  const modules: TextForwardingModule[] = []
  const hash = createHash('sha256')
  let json: { dependencies?: object; devDependencies?: object; peerDependencies?: object }
  try {
    json = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
  } catch {
    return { modules, key: '' }
  }
  const names = [
    ...new Set([
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.devDependencies ?? {}),
      ...Object.keys(json.peerDependencies ?? {}),
    ]),
  ].sort()
  for (const name of names) {
    const dir = installedPackage(projectRoot, name)
    if (!dir) continue
    let manifestFile: string | undefined
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJson
      manifestFile = pkg.hozo?.manifest
    } catch {
      continue
    }
    if (!manifestFile) continue
    const text = readFromDisk(path.join(dir, manifestFile))
    if (text === undefined) continue
    let manifest: HozoManifest
    try {
      manifest = JSON.parse(text)
    } catch {
      // A package's broken manifest is the package's bug. Reading nothing
      // from it leaves its callers compiling as they did without one.
      continue
    }
    hash.update(`${name}\u0000${text}\u0000`)
    modules.push(textForwardingModule(name, manifest))
  }
  return { modules, key: modules.length > 0 ? hash.digest('hex') : '' }
}

/** Node's lookup: `node_modules/<name>` here or in any directory above. */
function installedPackage(from: string, name: string): string | undefined {
  let dir = path.resolve(from)
  while (true) {
    const candidate = path.join(dir, 'node_modules', name)
    if (existsSync(path.join(candidate, 'package.json'))) return candidate
    const up = path.dirname(dir)
    if (up === dir) return undefined
    dir = up
  }
}
