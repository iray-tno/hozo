// Dev-only loader: requires the native addon copied next to this file by
// `scripts/build-native.mjs` (`pnpm build:native`). Native `.node` addons
// load via CJS `require`, even from an ESM package -- hence `createRequire`
// rather than a dynamic `import()`. See that script's header comment for
// why this isn't @napi-rs/cli-packaged yet.

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { diagnoseStaticFonts, type FontAvailability } from './font-diagnostics.ts'
import { loadNativeBinding } from './native-loader.ts'
import { DEFAULT_PRIMITIVE_SOURCES } from './sources.ts'

export type { FontAvailability } from './font-diagnostics.ts'

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
  /// Named imports `jsx` needs from `@hozo/engine`. Empty for most
  /// components; a synthesized interactive element needs the keyboard
  /// activation handlers, since only script can give a `<div>` the Enter
  /// and Space behaviour a `<button>` gets from the browser.
  runtimeImports: string[]
  diagnostics: CompileDiagnostic[]
  spanStart: number
  spanEnd: number
  /** Opt-in actual backend tag emissions, with input UTF-16 name spans. */
  tagDecisions?: CompiledTagDecision[]
  /** Opt-in copied source fragments; emitted coordinates are relative to `jsx`. */
  sourceCopies?: CompiledSourceCopy[]
}

export interface CompiledSourceCopy {
  spanStart: number
  spanEnd: number
  emittedStart: number
  emittedEnd: number
}

export interface CompiledTagDecision {
  spanStart: number
  spanEnd: number
  /** Absent for an authored closing tag consumed by an emitted void element. */
  replacement?: string
}

export interface CompiledNativeComponent {
  jsx: string
  styles: string
  /// Statements to splice at `hookSlot` for `jsx` to work. Empty unless a
  /// condition needed a React hook (`dark:`, breakpoints).
  prelude: string[]
  /// Named imports `prelude` needs from `@hozo/engine`.
  runtimeImports: string[]
  /// Components `jsx` needs from `react-native` itself.
  ///
  /// Reported rather than left to the caller to work out from the JSX. A
  /// tag the author wrote and the compiler carried verbatim is not in
  /// here, which is the distinction a regular expression could not make.
  nativeImports: string[]
  /// UTF-16 code-unit offset just inside the enclosing function's `{` -- the only safe
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

export interface ReactNativeReference {
  kind: 'runtime' | 'type'
  access: 'value' | 'static-member' | 'dynamic-member' | 'jsx' | 'reexport'
  member?: string
  /** Authored UTF-16 offsets, already converted at the NAPI boundary. */
  spanStart: number
  spanEnd: number
}

export interface ReactNativeBindingUsage {
  imported: string
  local?: string
  exported?: string
  kind: 'import' | 'reexport' | 'side-effect'
  typeOnly: boolean
  spanStart: number
  spanEnd: number
  references: ReactNativeReference[]
}

export interface ReactNativeUsage {
  diagnostics: CompileDiagnostic[]
  bindings: ReactNativeBindingUsage[]
}

export interface ReactNativeImportSpecifier {
  imported: string
  local: string
  kind: 'named' | 'default' | 'namespace'
  typeOnly: boolean
  spanStart: number
  spanEnd: number
}

export interface ReactNativeImportDeclaration {
  spanStart: number
  spanEnd: number
  sourceStart: number
  sourceEnd: number
  hasAttributes: boolean
  specifiers: ReactNativeImportSpecifier[]
  comments: { spanStart: number; spanEnd: number }[]
}

export interface ReactNativeImports {
  diagnostics: CompileDiagnostic[]
  declarations: ReactNativeImportDeclaration[]
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
  /** Unique runtime import specifiers for the active bundler to resolve. */
  imports: string[]
  /** Missing on the byte-scan fast path; absence is not proof of completeness. */
  context?: StylexModuleContextSummary
}

/** Conservative AST reference evidence, not runtime resolution or minimal data flow. */
export interface StylexModuleContextSummary {
  parseComplete: boolean
  hasStylexImport: boolean
  /** Non-intrinsic imports referenced as values, including possible type/shadowing false positives. */
  valueImports: string[]
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
  /** Grammar of the definition; omitted retains the historical TSX default. */
  sourceFile?: string
  links: StylexExternalBinding[]
}

/** One module specifier resolved to a source already registered in Rust. */
export interface StylexExternalBinding {
  specifier: string
  moduleId: string
}

/** Native output and source metadata produced by one source parser pass. */
export interface CompiledNativeModule {
  /** Source parser errors, including modules with no lowerable JSX roots. */
  syntaxDiagnostics: CompileDiagnostic[]
  components: CompiledNativeComponent[]
  imports: SourceImport[]
  /** Local bindings used as real JSX tag roots; comments and type syntax are excluded. */
  jsxBindings: string[]
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
  new (path?: string, sources?: string[]): CandidateCache
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
  reactNativeImports(source: string, sourceFile?: string): ReactNativeImports
  analyzeReactNativeUsage(source: string, sourceFile?: string): ReactNativeUsage
  compile(source: string): CompiledComponent[]
  compileNative(source: string): CompiledNativeComponent[]
  compileCanvasPaints(source: string, native: boolean): CompiledCanvasPaint[]
  moduleImports(source: string, module: string): string[]
  topLevelBindings(source: string): string[]
  foreignPrimitives(source: string, sources: string[]): string[]
  summarizeStylexModule(source: string, sourceFile?: string): StylexModuleSummary
  CandidateCache: CandidateCacheConstructor
  Compiler: CompilerConstructor
}

/// The napi class itself. It knows nothing about `sources` beyond having
/// been handed them; `createCompiler` is what makes them readable back.
interface NativeCompiler {
  compile(
    source: string,
    bindings?: StylexExternalBinding[],
    rehomeReactNative?: boolean,
    tagEvidence?: boolean,
  ): CompiledComponent[]
  compileNative(source: string, bindings?: StylexExternalBinding[]): CompiledNativeComponent[]
  compileNativeModule(
    source: string,
    bindings?: StylexExternalBinding[],
    sourceFile?: string,
  ): CompiledNativeModule
  unfoldJsxCalls(source: string): UnfoldedModule | undefined
  setStylexModules(modules: StylexModuleSource[]): void
  compileCanvasPaints(source: string, native: boolean): CompiledCanvasPaint[]
}

interface CompilerConstructor {
  new (theme?: Theme, sources?: string[]): NativeCompiler
}

let native: NativeBinding | undefined
let bindingIdentity: { specifier: string; path: string } | undefined

function loadNative(): NativeBinding {
  if (!native) {
    native = loadNativeBinding<NativeBinding>({
      require: (specifier) => {
        const loaded = require(specifier)
        bindingIdentity = { specifier, path: require.resolve(specifier) }
        return loaded
      },
      localPath: fileURLToPath(new URL('../hozo_napi.node', import.meta.url)),
    })
  }
  return native
}

/** The binding actually loaded, not a guess from the platform or override setting. */
export function getCompilerBindingIdentity(): { specifier: string; path: string } {
  loadNative()
  return { ...bindingIdentity! }
}

/**
 * A project's design tokens, as `@hozo/tailwind` extracts them.
 *
 * Given to a `Compiler` once, not to every call. See `createCompiler`.
 */
export interface Theme {
  colors: {
    token: string
    oklch: string
    hex: string
    /**
     * What the token becomes under `prefers-color-scheme: dark`.
     *
     * Both backends already had the machinery -- the Web emits a media
     * query and Native a second `StyleSheet` behind a boolean guard -- and
     * carried it only for a `dark:` somebody wrote by hand. A paired token
     * is a project saying it once, in its theme, for every class list.
     */
    dark?: { oklch: string; hex: string }
  }[]
  /** One spacing step in pixels; Tailwind's `--spacing`, 0.25rem by default. */
  spacingPx?: number
  /**
   * The project's own animations, `--animate-<name>` with its `@keyframes`
   * (decision 007, slice 3). `@hozo/tailwind`'s `loadTheme` reads them.
   */
  animations?: {
    name: string
    shorthand: string
    keyframesCss?: string
    frames?: { selector: string; declarations: [string, string][] }[]
  }[]
  /**
   * Whether the project ships a CSS reset over the browser's own stylesheet.
   *
   * The resolved `preflight` option -- `preflightEnabled` in
   * `@hozo/compiler/project` -- not `usesTailwind`, and not the raw
   * option. Only the Native backend reads it: it has no user-agent
   * stylesheet to inherit, so its defaults are copied from a browser, and
   * this says which browser (#315). Omitted means no reset, which is what
   * a caller that has never heard of the question should get.
   *
   * It rides on the theme because it is one project-wide fact resolved
   * once at build start, crossing the addon boundary once with the rest of
   * them, rather than a second per-file argument to forget.
   */
  preflight?: boolean
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
/**
 * A module whose folded primitives are JSX again.
 *
 * `importSource` is the JSX runtime the calls came from, and the caller
 * has to fold them back with it: Astro MDX output is `_jsx` from
 * `astro/jsx-runtime`, and the same tree re-folded under a project's
 * default is built by React's runtime -- which Astro renders as
 * `[object Object]`, with no error, on a page whose stylesheet came out
 * correct.
 */
export interface UnfoldedModule {
  code: string
  importSource?: string
}

/** Per-call Web compile options. */
export interface CompileOptions {
  /**
   * Lower React Native's compatibility components (`TouchableOpacity`,
   * `Modal`, ...) to `@hozo/rn-compat` stand-ins even when they were
   * imported from `react-native`. Off unless the project opted into
   * rewriting with `unloweredReactNativeJsx`; imported from
   * `@hozo/rn-compat` itself they lower either way.
   */
  rehomeReactNative?: boolean
  /** Opt-in tag and copied-expression emission records; neither is allocated ordinarily. */
  tagEvidence?: boolean
}

export interface Compiler {
  compile(
    source: string,
    bindings?: StylexExternalBinding[],
    options?: CompileOptions,
  ): CompiledComponent[]
  compileNative(source: string, bindings?: StylexExternalBinding[]): CompiledNativeComponent[]
  /**
   * Native lowering plus source imports and foreign primitive bindings from
   * that same parse. Bundler integrations should prefer this over reparsing
   * the file around `compileNative`.
   * `sourceFile` selects syntax only; omitted retains TSX. It does not grant
   * transform support to a new extension in an integration.
   */
  compileNativeModule(
    source: string,
    bindings?: StylexExternalBinding[],
    sourceFile?: string,
  ): CompiledNativeModule
  /**
   * A machine-folded module with its primitives written back as JSX,
   * or `undefined` when there is nothing folded to put back.
   *
   * For an integration handed the output of an MDX plugin that was not
   * told `jsx: true` -- `@astrojs/mdx` has no such option to be told
   * (#137). Everything downstream then works unchanged, and the same
   * integration folds it back on the way out.
   */
  unfoldJsxCalls(source: string): UnfoldedModule | undefined
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
export function createCompiler(
  theme?: Theme,
  sources?: readonly string[],
  fontAvailability?: FontAvailability,
): Compiler {
  const allowed = sources ? [...sources] : [...DEFAULT_PRIMITIVE_SOURCES]
  const inner = new (loadNative().Compiler)(theme, allowed)
  return {
    compile: (source, bindings, options) =>
      inner
        .compile(
          source,
          bindings,
          options?.rehomeReactNative ?? false,
          options?.tagEvidence ?? false,
        )
        .map((result) => ({
          ...result,
          diagnostics: [
            ...result.diagnostics,
            ...diagnoseStaticFonts(
              result.css,
              'web',
              fontAvailability,
              result.spanStart,
              result.spanEnd,
            ),
          ],
        })),
    compileNative: (source, bindings) =>
      inner.compileNative(source, bindings).map((result) => ({
        ...result,
        diagnostics: [
          ...result.diagnostics,
          ...diagnoseStaticFonts(
            result.styles,
            'native',
            fontAvailability,
            result.spanStart,
            result.spanEnd,
          ),
        ],
      })),
    compileNativeModule: (source, bindings, sourceFile) => {
      const module = inner.compileNativeModule(source, bindings, sourceFile)
      return {
        ...module,
        components: module.components.map((result) => ({
          ...result,
          diagnostics: [
            ...result.diagnostics,
            ...diagnoseStaticFonts(
              result.styles,
              'native',
              fontAvailability,
              result.spanStart,
              result.spanEnd,
            ),
          ],
        })),
      }
    },
    unfoldJsxCalls: (source) => inner.unfoldJsxCalls(source) ?? undefined,
    setStylexModules: (modules) => inner.setStylexModules(modules),
    compileCanvasPaints: (source, native) => inner.compileCanvasPaints(source, native),
    sources: allowed,
  }
}

/** Exported StyleX sheets and variable tables visible to another module. */
export function summarizeStylexModule(source: string, sourceFile?: string): StylexModuleSummary {
  return loadNative().summarizeStylexModule(source, sourceFile)
}

/** Binding-aware authored ESM inventory; no transform or member compatibility claim. */
export function analyzeReactNativeUsage(source: string, sourceFile?: string): ReactNativeUsage {
  return loadNative().analyzeReactNativeUsage(source, sourceFile)
}

/** Structural declarations used by the actual Web import rewrite; no scope pass. */
export function reactNativeImports(source: string, sourceFile?: string): ReactNativeImports {
  return loadNative().reactNativeImports(source, sourceFile)
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

/**
 * `sources` is the project's list of modules primitives are lowered from --
 * the same list given to `createCompiler`, defaulting the same way -- so the
 * scan leaves a class to the compile only where the compile will read it.
 */
export function openCandidateCache(
  path?: string,
  sources: readonly string[] = DEFAULT_PRIMITIVE_SOURCES,
): CandidateCache {
  return new (loadNative().CandidateCache)(path, [...sources])
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
 * Every name a module binds at its top level as a runtime value: imports
 * (not type-only), functions, classes, enums and `var`/`let`/`const`
 * bindings, exported or not. Types, `declare` forms and export aliases do
 * not count. Parsed, so a comment or a string that mentions a name does not
 * count either.
 */
export function topLevelBindings(source: string): string[] {
  return loadNative().topLevelBindings(source)
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
