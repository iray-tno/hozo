// Dev-only loader: requires the native addon copied next to this file by
// `scripts/build-native.mjs` (`pnpm build:native`). Native `.node` addons
// load via CJS `require`, even from an ESM package -- hence `createRequire`
// rather than a dynamic `import()`. See that script's header comment for
// why this isn't @napi-rs/cli-packaged yet.

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { loadNativeBinding } from './native-loader.ts'
import { DEFAULT_PRIMITIVE_SOURCES } from './sources.ts'

const require = createRequire(import.meta.url)

export interface CompileDiagnostic {
  code: string
  severity: string
  message: string
  spanStart: number
  spanEnd: number
}

export interface CompiledComponent {
  jsx: string
  css: string
  /// Named imports `jsx` needs from `@hozo/runtime`. Empty for most
  /// components; a synthesized interactive element needs the keyboard
  /// activation handlers, since only script can give a `<div>` the Enter
  /// and Space behaviour a `<button>` gets from the browser.
  runtimeImports: string[]
  diagnostics: CompileDiagnostic[]
  spanStart: number
  spanEnd: number
}

export interface CompiledNativeComponent {
  jsx: string
  styles: string
  /// Statements to splice at `hookSlot` for `jsx` to work. Empty unless a
  /// condition needed a React hook (`dark:`, breakpoints).
  prelude: string[]
  /// Named imports `prelude` needs from `@hozo/runtime`.
  runtimeImports: string[]
  /// Components `jsx` needs from `react-native` itself.
  ///
  /// Reported rather than left to the caller to work out from the JSX. A
  /// tag the author wrote and the compiler carried verbatim is not in
  /// here, which is the distinction a regular expression could not make.
  nativeImports: string[]
  /// Byte offset just inside the enclosing function's `{` -- the only safe
  /// place for `prelude`, since a hook must be called unconditionally and
  /// in the same order every render. Absent (`null`/`undefined` -- napi
  /// marshals a Rust `None` as `undefined`) when this JSX isn't inside a
  /// function body a statement can go in: module scope, or a concise arrow.
  hookSlot: number | null | undefined
  diagnostics: CompileDiagnostic[]
  spanStart: number
  spanEnd: number
}

export interface SourceImport {
  /** Module specifier as written, for example `react-native`. */
  source: string
  /** Exported name, or `default` / `*` for those import forms. */
  imported: string
  /** Binding visible to expressions and JSX in this module. */
  local: string
}

export interface StylexModuleMemberSummary {
  name: string
  status: 'static' | 'partial' | 'function' | 'unsupported'
}

export interface StylexModuleExportSummary {
  /** Name an importing module sees, after any `export { local as alias }`. */
  exported: string
  /** Binding name inside the defining module. */
  local: string
  kind: 'sheet' | 'variables'
  members: StylexModuleMemberSummary[]
}

/** AST-independent facts the project graph caches for one source module. */
export interface StylexModuleSummary {
  exports: StylexModuleExportSummary[]
  reexports: StylexModuleReexportSummary[]
}

export interface StylexModuleReexportSummary {
  specifier: string
  /** Export in the target module, or `*` for star/namespace exports. */
  imported: string
  /** Export exposed by this module, or `*` only for a plain export-all edge. */
  exported: string
}

export interface StylexModuleSource {
  id: string
  contentHash: string
  source: string
  links: StylexExternalBinding[]
}

/** One module specifier resolved to a source already registered in Rust. */
export interface StylexExternalBinding {
  specifier: string
  moduleId: string
}

/** Native output and source metadata produced by one TSX parser pass. */
export interface CompiledNativeModule {
  components: CompiledNativeComponent[]
  imports: SourceImport[]
  /** Primitive-named bindings the compiler deliberately carried verbatim. */
  foreignPrimitives: string[]
}

export interface CompiledCanvasPaint {
  replacement: string
  diagnostics: CompileDiagnostic[]
  spanStart: number
  spanEnd: number
}

/// Accumulates the project's runtime-resolvable class candidates (proposal
/// §7's third tier) and turns them into one stylesheet. See the Rust side's
/// doc comment for why this is project-wide rather than per file.
export interface CandidateCache {
  /// True when `path` was already scanned at exactly this mtime -- the
  /// caller can skip reading the file at all.
  isCurrent(path: string, modifiedMs: number): boolean
  /// Records a scan of `source`. Returns whether the candidate set changed,
  /// so an unchanged one doesn't cause a stylesheet rewrite.
  scanFile(path: string, source: string, modifiedMs: number): boolean
  forget(path: string): boolean
  /// Drops cached contributions from files absent from a complete walk.
  retainFiles(paths: string[]): number
  /// The Web stylesheet: rules under the classes' real Tailwind names, for
  /// the browser's own CSS engine to match.
  /// `order` is these candidates in the order Tailwind would write
  /// them (see `@hozo/tailwind`'s `loadProjectClassOrder`). Every rule
  /// here is a single class, so order is the whole cascade; without it
  /// the set is alphabetical and `sm:` lands after `md:`.
  renderCss(theme?: Theme, order?: readonly string[]): string
  /// Every candidate held, to be handed to Tailwind for an order.
  candidates(): string[]
  /// The Native equivalent: a JS module exporting `hozoClasses`, a
  /// resolver bound to this project's class-name -> style-object map.
  renderNativeModule(theme?: Theme): string
  persist(): void
  readonly size: number
  /// Whether any scanned file names a Tailwind utility.
  ///
  /// Not `renderCss() !== ''`: the candidate set holds only what the
  /// compiler could not read, and an ordinary project's Tailwind is all
  /// static `className` that it reads exactly. The Web integrations pick
  /// the base layer from this.
  readonly usesTailwind: boolean
}

interface CandidateCacheConstructor {
  /// `path` is where the cache persists between builds; omit it to keep the
  /// cache in memory only.
  new (path?: string): CandidateCache
}

/**
 * The addon's surface, as `crates/hozo_napi` actually exports it.
 *
 * Hand-written, and therefore capable of drifting -- which it had. This
 * said `compile(source)` while every caller passed three arguments, and
 * omitted `moduleImports` and `foreignPrimitives` entirely, because
 * nothing in the repository had ever type-checked. It went unnoticed for
 * as long as it did because a wrong type here costs nothing at runtime:
 * the calls were always correct, only their description was not.
 *
 * napi-rs can generate this from the Rust, which is the better answer and
 * the one to move to when `pack:native` grows up into its CLI.
 */
interface NativeBinding {
  compile(source: string): CompiledComponent[]
  compileNative(source: string): CompiledNativeComponent[]
  compileCanvasPaints(source: string, native: boolean): CompiledCanvasPaint[]
  moduleImports(source: string, module: string): string[]
  foreignPrimitives(source: string, sources: string[]): string[]
  summarizeStylexModule(source: string): StylexModuleSummary
  CandidateCache: CandidateCacheConstructor
  Compiler: CompilerConstructor
}

/// The napi class itself. It knows nothing about `sources` beyond having
/// been handed them; `createCompiler` is what makes them readable back.
interface NativeCompiler {
  compile(source: string, bindings?: StylexExternalBinding[]): CompiledComponent[]
  compileNative(source: string, bindings?: StylexExternalBinding[]): CompiledNativeComponent[]
  compileNativeModule(source: string, bindings?: StylexExternalBinding[]): CompiledNativeModule
  setStylexModules(modules: StylexModuleSource[]): void
  compileCanvasPaints(source: string, native: boolean): CompiledCanvasPaint[]
}

interface CompilerConstructor {
  new (theme?: Theme, sources?: string[]): NativeCompiler
}

let native: NativeBinding | undefined

function loadNative(): NativeBinding {
  if (!native) {
    native = loadNativeBinding<NativeBinding>({
      require,
      localPath: fileURLToPath(new URL('../hozo_napi.node', import.meta.url)),
    })
  }
  return native
}

/**
 * A project's design tokens, as `@hozo/tailwind` extracts them.
 *
 * Given to a `Compiler` once, not to every call. See `createCompiler`.
 */
export interface Theme {
  colors: { token: string; oklch: string; hex: string }[]
}

/**
 * A compiler holding what a project decided once.
 *
 * Everything a build knows before it sees a file lives here: the theme,
 * and which modules its primitives may come from. Both are per-project,
 * and passing them per-file was costing 0.134ms a file to marshal a
 * 288-colour palette across the addon boundary -- forty-five times what
 * compiling a small file costs, for something that does not depend on the
 * file at all.
 *
 * The stronger reason is that a theme was easy to leave out and leaving it
 * out did not fail. The compiler used the default palette and spacing
 * scale, and the output looked entirely reasonable. There is no argument
 * left to forget: the free `compile` below takes no theme, so compiling
 * against a project's own requires holding one of these.
 */
export interface Compiler {
  compile(source: string, bindings?: StylexExternalBinding[]): CompiledComponent[]
  compileNative(source: string, bindings?: StylexExternalBinding[]): CompiledNativeComponent[]
  /**
   * Native lowering plus source imports and foreign primitive bindings from
   * that same parse. Bundler integrations should prefer this over reparsing
   * the file around `compileNative`.
   */
  compileNativeModule(source: string, bindings?: StylexExternalBinding[]): CompiledNativeModule
  /** Replace the project's parsed cross-file StyleX registry. */
  setStylexModules(modules: StylexModuleSource[]): void
  compileCanvasPaints(source: string, native: boolean): CompiledCanvasPaint[]
  /**
   * The modules the compiler will lower a primitive-named tag from.
   *
   * Readable because callers need the same list for a cheap reject before
   * they hand anything over -- a file mentioning none of these has nothing
   * to lower, and most of a project's files mention none. Read from here
   * rather than passed again beside the compiler: two copies of one
   * decision is how they come to disagree.
   */
  readonly sources: readonly string[]
}

/**
 * A compiler for one project.
 *
 * `sources` is per *tag*: a name imported from a module not on the list is
 * carried verbatim instead of lowered. Left out, the default set applies.
 */
export function createCompiler(theme?: Theme, sources?: readonly string[]): Compiler {
  const allowed = sources ? [...sources] : [...DEFAULT_PRIMITIVE_SOURCES]
  const inner = new (loadNative().Compiler)(theme, allowed)
  return {
    compile: (source, bindings) => inner.compile(source, bindings),
    compileNative: (source, bindings) => inner.compileNative(source, bindings),
    compileNativeModule: (source, bindings) => inner.compileNativeModule(source, bindings),
    setStylexModules: (modules) => inner.setStylexModules(modules),
    compileCanvasPaints: (source, native) => inner.compileCanvasPaints(source, native),
    sources: allowed,
  }
}

/** Exported StyleX sheets and variable tables visible to another module. */
export function summarizeStylexModule(source: string): StylexModuleSummary {
  return loadNative().summarizeStylexModule(source)
}

/**
 * Compiles against Tailwind's default theme, trusting every module.
 *
 * For tests and one-off inspection. A build wants `createCompiler` -- this
 * one cannot be given a project's palette, which is deliberate: an
 * argument that can be omitted silently is how the wrong palette gets
 * compiled in without anything failing.
 */
export function compile(source: string): CompiledComponent[] {
  return loadNative().compile(source)
}

/** The Native backend, against the default theme. See `compile`. */
export function compileNative(source: string): CompiledNativeComponent[] {
  return loadNative().compileNative(source)
}

/** Canvas-specific paint edits; kept separate from semantic component IR. */
export function compileCanvasPaints(source: string, native = false): CompiledCanvasPaint[] {
  return loadNative().compileCanvasPaints(source, native)
}

export function openCandidateCache(path?: string): CandidateCache {
  return new (loadNative().CandidateCache)(path)
}

/**
 * Every binding a source file imports from one module, by local name.
 *
 * The Native backend prepends its own `react-native` import, and a React
 * Native file already has one -- re-declaring a name it already binds is a
 * SyntaxError rather than a harmless duplicate.
 */
export function moduleImports(source: string, module: string): string[] {
  return loadNative().moduleImports(source, module)
}

/**
 * Primitive-named bindings this file must not have lowered.
 *
 * One implementation of the rule, in the compiler: a module the project
 * doesn't trust, or a name a trusted module spells the same and means
 * differently. See `./sources.ts`.
 */
export function foreignPrimitiveNames(source: string, sources: readonly string[]): string[] {
  return loadNative().foreignPrimitives(source, [...sources])
}
