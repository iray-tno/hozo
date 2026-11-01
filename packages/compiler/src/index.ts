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

/** @internal Must match the native scalar output policy; integration tests verify it. */
export const TAILWIND_SCALAR_ORDER_POLICY = 'scalar-order-v8' as const

const require = createRequire(import.meta.url)

export interface CompileDiagnostic {
  code: string
  severity: string
  message: string
  spanStart: number
  spanEnd: number
}

/** @internal Captured output policy and write evidence, not a full cascade support verdict. */
export interface TailwindCompilePlan {
  fingerprint: string
  mode: 'passthrough' | typeof TAILWIND_SCALAR_ORDER_POLICY
  sites: {
    spanStart: number
    spanEnd: number
    classProp: string
    writeCount: number
    blocks: {
      start: number
      end: number
      source: 'tailwind' | 'stylex' | 'unspecified'
      inputStart?: number
      utilityId?: number
      guarded: boolean
      status:
        | 'described'
        | 'not-generated'
        | 'uncollected'
        | 'missing-identity'
        | 'stylex'
        | 'unspecified'
      candidate?: string
      candidateId?: number
      ruleIds: number[]
      /** Shared priority facts only, not value/condition equivalence or a new winner. */
      writes: {
        index: number
        ruleId?: number
        cssProperty?: string
        specificity?: number[]
        /** Assessed priority in this plan's fingerprint, not an emission rank. */
        priorityRank?: number
        important?: boolean
        reason?: string
      }[]
    }[]
  }[]
}

/** @internal RFC 007 evidence; described does not mean supported or ordered. */
export interface TailwindOrderInspection {
  fingerprint?: string
  syntaxDiagnostics: CompileDiagnostic[]
  /** Only utilities retained by the parser, not a complete lexical/project inventory. */
  candidates: {
    /** Local to this parsed module, not an upstream candidate/rule rank. */
    utilityId: number
    candidate: string
    status: 'described' | 'not-generated' | 'uncollected' | 'no-context'
    candidateId?: number
    /** Every upstream rule, not only the first. Scoped by `fingerprint`. */
    ruleIds: number[]
  }[]
}

export interface CompiledComponent {
  /** @internal Evidence from this compile's existing parse, when requested with a context. */
  tailwindPlan?: TailwindCompilePlan
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
  /** @internal RFC010: style-only preparation, absent on ordinary output. */
  ownerStyle?: {
    /** Declared callback inputs; not an owner/audit certification. */
    facts?: ('disabled' | 'aria-selected' | 'aria-disabled')[]
    expression: string
    callback: boolean
    focusVisible: boolean
    literalResting: boolean
  }
  /** @internal Build-time only; never included in emitted JSX/styles. */
  tailwindPlan?: TailwindCompilePlan
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

/** What one file's exported components hand their children as text styles (#950). */
export interface TextForwardingSummary {
  components: TextForwardingComponent[]
  /** `export { A as B } from './x'`, to follow an entry to its definitions. */
  reexports: { specifier: string; imported: string; exported: string }[]
}

/**
 * A class-joining function, by the specifier its callers import it from as
 * written and the name they import: `default` for a default import.
 */
export interface ClassHelper {
  module: string
  name: string
}

/** One package's text forwarding: the specifier callers import from, and its components. */
export interface TextForwardingModule {
  module: string
  components: TextForwardingComponent[]
}

export interface TextForwardingComponent {
  name: string
  props: { name: string; default?: string | null; values: string[] }[]
  variants: { when: string[]; classes: string }[]
  disabledProp?: string | null
  hostStates?: boolean | null
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
  /** About the module rather than one component: a class React Native cannot draw in a class prop no component lowered (#1166). */
  diagnostics: CompileDiagnostic[]
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
  /** Opaque native scan facts; source/transform revision validation is the adapter's job. */
  exportFile(path: string): string | null
  /** Replay matching schema/source-policy facts without reading/parsing source. */
  importFile(path: string, record: string, modifiedMs: number): boolean
  forget(path: string): boolean
  /// Drops cached contributions from files absent from a complete walk.
  retainFiles(paths: string[]): number
  /// The Web stylesheet: rules under the classes' real Tailwind names, for
  /// the browser's own CSS engine to match. Ordinary selectors sit in the
  /// low-priority `utilities.hozo-candidates` layer; an unlayered copy applies
  /// only to compiler-marked dynamic class targets, not their descendants.
  /// `order` is these candidates in the order Tailwind would write
  /// them (see `@hozo/tailwind`'s `loadProjectClassOrder`). The ownership
  /// marker adds no specificity, so ordering within each copy still matters;
  /// without an order hint the set is alphabetical and `sm:` lands after `md:`.
  renderCss(theme?: Theme, order?: readonly string[]): string
  /// Every candidate held, to be handed to Tailwind for an order.
  candidates(): string[]
  /// The Native equivalent: a JS module exporting `hozoClasses`, a
  /// resolver bound to this project's class-name -> style-object map.
  renderNativeModule(theme?: Theme): string
  /** @internal One actual generation pass with a build-time-only sidecar.
   * Requires a complete context; returned code is unchanged. Not installed
   * by adapters yet. Group ranks are original-rule facts, not platform proof.
   */
  renderNativeModulePlan(context: PreparedTailwindContext, theme?: Theme): NativeCandidatePlan
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
  inspectOwnerClassSlots(
    source: string,
    targets: OwnerSlotBinding[],
    sourceFile?: string,
  ): OwnerSlotInspection
  prepareTailwindContext(snapshot: string): PreparedTailwindContext
  prepareFinalTailwindContext(snapshot: string): PreparedTailwindContext
  reactNativeImports(source: string, sourceFile?: string): ReactNativeImports
  analyzeReactNativeUsage(source: string, sourceFile?: string): ReactNativeUsage
  compile(source: string): CompiledComponent[]
  compileNative(source: string): CompiledNativeComponent[]
  compileCanvasPaints(source: string, native: boolean): CompiledCanvasPaint[]
  moduleImports(source: string, module: string): string[]
  topLevelBindings(source: string): string[]
  foreignPrimitives(source: string, sources: string[]): string[]
  summarizeStylexModule(source: string, sourceFile?: string): StylexModuleSummary
  summarizeTextForwarding(source: string): TextForwardingSummary
  classHelperCandidates(source: string): { specifier: string; imported: string }[]
  scanTailwindOrderCandidates(source: string): string[]
  nativeClassReport(source: string): NativeClassFinding[]
  nativeClassVerdicts(classNames: string[]): (NativeClassVerdict | null)[]
  nativeClassesDrawnStatically(source: string): string[]
  summarizeClassHelpers(source: string): string[]
  CandidateCache: CandidateCacheConstructor
  Compiler: CompilerConstructor
}

/// The napi class itself. It knows nothing about `sources` beyond having
/// been handed them; `createCompiler` is what makes them readable back.
interface NativeCompiler {
  compileNativeOrPrepare(
    source: string,
    context: PreparedTailwindContext,
    bindings?: StylexExternalBinding[],
    sourceFile?: string,
    options?: NativeCompileOptions,
  ): CompiledNativeModule | PreparedModule<CompiledNativeModule>
  compileWebOrPrepare(
    source: string,
    context: PreparedTailwindContext,
    bindings?: StylexExternalBinding[],
    options?: CompileOptions,
  ): CompiledComponent[] | PreviewableWebModule
  prepareWebModule(
    source: string,
    bindings?: StylexExternalBinding[],
    options?: CompileOptions,
  ): PreviewableWebModule
  prepareNativeModule(
    source: string,
    bindings?: StylexExternalBinding[],
    sourceFile?: string,
    options?: NativeCompileOptions,
  ): PreparedModule<CompiledNativeModule>
  setTailwindOrder(snapshot?: string): void
  inspectTailwindOrder(
    source: string,
    bindings?: StylexExternalBinding[],
    sourceFile?: string,
  ): TailwindOrderInspection
  compile(
    source: string,
    bindings?: StylexExternalBinding[],
    rehomeReactNative?: boolean,
    tagEvidence?: boolean,
    tailwindPlan?: boolean,
  ): CompiledComponent[]
  compileNative(
    source: string,
    bindings?: StylexExternalBinding[],
    tailwindPlan?: boolean,
  ): CompiledNativeComponent[]
  compileNativeModule(
    source: string,
    bindings?: StylexExternalBinding[],
    sourceFile?: string,
    options?: NativeCompileOptions,
  ): CompiledNativeModule
  unfoldJsxCalls(source: string): UnfoldedModule | undefined
  setStylexModules(modules: StylexModuleSource[]): void
  setTextForwarding(modules: TextForwardingModule[]): void
  /** Replace the project's own class-joining functions (#964); see `./project.ts`. */
  setClassHelpers(helpers: ClassHelper[]): void
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
   * The project's own radius tokens in pixels: `control` for
   * `--radius-control`, which `rounded-control` reads. `@hozo/tailwind`'s
   * `loadTheme` reads them, including overrides of built-in scale names
   * such as `lg`. Missing scale values keep their theme-free defaults.
   */
  radii?: { name: string; px: number }[]
  /** Named Tailwind font weights, kept separate from authored numeric weights. */
  fontWeights?: { name: string; value: string }[]
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

/** Per-call build-time evidence, separate from the plan's normal work. */
export interface CompileEvidence {
  /** @internal Capture the shared plan from this compile; requires a prepared context. */
  tailwindPlan?: boolean
}

export interface NativeCompileOptions extends CompileEvidence {
  /** @internal RFC010 leaf-owner preparation; not a project/bundler mode. */
  ownerStyle?: boolean
  /** @internal Explicit existing-owner booleans, requires ownerStyle. Literal Pressable only. */
  ownerFacts?: readonly ('disabled' | 'aria-selected' | 'aria-disabled')[]
  textReference?: boolean
  textInheritance?: boolean
  textStatic?: boolean
}

/** Per-call Web compile options. */
export interface CompileOptions extends CompileEvidence {
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

declare const preparedContext: unique symbol

/** @internal Rule IDs and their ordinal positions belong to this fingerprint.
 * Emission order does not incorporate CSS cascade importance/specificity or
 * assert Hozo supports a rule. Keep every rule, not a candidate's first rank.
 */
export interface TailwindRuleOrder {
  fingerprint: string
  rules: { candidateId: number; ruleId: number }[]
}

/** @internal Assessed rule priorities within one Tailwind utility input tier.
 * Missing ranks retain a reason, not zero. Application/input/condition/value
 * compatibility and platform normalization remain the planner's responsibility.
 */
export interface TailwindRulePriorities {
  fingerprint: string
  rules: {
    candidateId: number
    ruleId: number
    rank?: number
    important?: boolean
    specificity?: number[]
    reason?: string
  }[]
}

/** @internal Versioned build-time sidecar, not device resolver arguments. */
export interface NativeCandidatePlan {
  code: string
  schema: 1
  fingerprint: string
  /** @internal Only for the assessed physical-scalar conflict domain.
   * Missing entries are barriers; no ordering payload for conflict-free maps.
   * The enclosing fingerprint owns every ordinal; not yet installed by adapters.
   */
  ordering?: { schema: 1; ranks: Record<string, number[]> }
  entries: {
    candidate: string
    candidateId: number
    kind: 'style' | 'state' | 'refused'
    reason?: string
    groups: {
      /** Index of the generated state object, or zero for styles[candidate]. */
      index: number
      stateKeys: string[]
      nativeKeys: string[]
      orderable: boolean
      /** Original IR write indices before Native expansion/deduplication. */
      writes: TailwindCompilePlan['sites'][number]['blocks'][number]['writes']
      /** Only uniform assessed writes receive a whole-object fact. */
      priorityRank?: number
      reason?: string
    }[]
  }[]
}

/** @internal Immutable validated build-time context, shared across a batch. */
export interface PreparedTailwindContext {
  readonly [preparedContext]: true
  readonly fingerprint: string
  requireCandidates(candidates: string[]): void
  /** Build-time only; lazily prepare one native index and return a JS copy. */
  ruleOrder(): TailwindRuleOrder
  /** Whole-table JS copy for project preparation, not a per-file or runtime call. */
  rulePriorities(): TailwindRulePriorities
}

/** @internal One-shot, process-local owned parse. dispose is idempotent. */
export interface PreparedModule<T> {
  readonly candidates: readonly string[]
  emit(context: PreparedTailwindContext): T
  dispose(): void
}

/** @internal Web import discovery may borrow the parse before final CSS.
 * Native output is not granted this capability: ordering can change its JSX. */
export interface PreviewableWebModule extends PreparedModule<CompiledComponent[]> {
  preview(): CompiledComponent[]
}

/** @internal Validate/decode once; do not install mutable compiler state. */
export function prepareTailwindContext(snapshot: string): PreparedTailwindContext {
  return loadNative().prepareTailwindContext(snapshot)
}

/** @internal Completed finite-batch output capability; not an adapter flag.
 * Its fingerprint includes the output policy, unlike pass-through contexts. */
export function prepareFinalTailwindContext(snapshot: string): PreparedTailwindContext {
  return loadNative().prepareFinalTailwindContext(snapshot)
}

function validateNativeOptions(options: NativeCompileOptions | undefined) {
  if (
    options?.ownerStyle &&
    (options.textReference || options.textInheritance || options.textStatic)
  )
    throw new Error('Internal ownerStyle cannot be combined with text experiments')
  if (options?.textReference && options.textInheritance)
    throw new Error('Select one internal text experiment per compile call')
  if (options?.textStatic && !options.textInheritance)
    throw new Error('Internal textStatic requires textInheritance')
}

function annotateWeb(results: CompiledComponent[], fonts: FontAvailability | undefined) {
  return results.map((result) => ({
    ...result,
    diagnostics: [
      ...result.diagnostics,
      ...diagnoseStaticFonts(result.css, 'web', fonts, result.spanStart, result.spanEnd),
    ],
  }))
}

function annotatePreparedWeb(
  prepared: PreviewableWebModule,
  availability: FontAvailability | undefined,
): PreviewableWebModule {
  const fonts = availability && structuredClone(availability)
  return {
    candidates: Object.freeze(prepared.candidates),
    preview: () => annotateWeb(prepared.preview(), fonts),
    emit: (context) => annotateWeb(prepared.emit(context), fonts),
    dispose: () => prepared.dispose(),
  }
}

function annotatePreparedNative(
  prepared: PreparedModule<CompiledNativeModule>,
  availability: FontAvailability | undefined,
): PreparedModule<CompiledNativeModule> {
  const fonts = availability && structuredClone(availability)
  return {
    candidates: Object.freeze(prepared.candidates),
    emit: (context) => {
      const output = prepared.emit(context)
      return { ...output, components: annotateNative(output.components, fonts) }
    },
    dispose: () => prepared.dispose(),
  }
}

function annotateNative(results: CompiledNativeComponent[], fonts: FontAvailability | undefined) {
  return results.map((result) => ({
    ...result,
    diagnostics: [
      ...result.diagnostics,
      ...diagnoseStaticFonts(result.styles, 'native', fonts, result.spanStart, result.spanEnd),
    ],
  }))
}

export interface Compiler {
  /** @internal Native counterpart: preserve full metadata/text ABI on direct hit or retained miss. */
  compileNativeOrPrepare(
    source: string,
    context: PreparedTailwindContext,
    bindings?: StylexExternalBinding[],
    sourceFile?: string,
    options?: NativeCompileOptions,
  ): CompiledNativeModule | PreparedModule<CompiledNativeModule>
  /** @internal Emit directly only when the actual parse is complete in context.
   * A miss returns that same parse, never a second parsing attempt.
   */
  compileWebOrPrepare(
    source: string,
    context: PreparedTailwindContext,
    bindings?: StylexExternalBinding[],
    options?: CompileOptions,
  ): CompiledComponent[] | PreparedModule<CompiledComponent[]>
  /** @internal RFC 007: retain one actual parse across async preparation.
   * Emission consumes the module and requires an explicitly prepared context;
   * it does not read mutable Compiler configuration at emit time.
   */
  prepareWebModule(
    source: string,
    bindings?: StylexExternalBinding[],
    options?: CompileOptions,
  ): PreviewableWebModule
  /** @internal Same lifecycle for Native, preserving metadata and text ABI selection. */
  prepareNativeModule(
    source: string,
    bindings?: StylexExternalBinding[],
    sourceFile?: string,
    options?: NativeCompileOptions,
  ): PreparedModule<CompiledNativeModule>
  /** @internal RFC 007: JSON of a prepared snapshot; undefined clears it.
   * Preparation validates before replacing. Web/Native consume a shared
   * pass-through plan before lowering; no cascade winners change yet.
   * No app provider or runtime sorting is introduced.
   */
  setTailwindOrder(snapshot?: string): void
  /** @internal Evidence-only parse using the existing project helper/StyleX registry.
   * Do not call before compile in an adapter: compile's tailwindPlan evidence
   * uses the transform's actual parse instead of introducing a second one.
   */
  inspectTailwindOrder(
    source: string,
    bindings?: StylexExternalBinding[],
    sourceFile?: string,
  ): TailwindOrderInspection
  compile(
    source: string,
    bindings?: StylexExternalBinding[],
    options?: CompileOptions,
  ): CompiledComponent[]
  compileNative(
    source: string,
    bindings?: StylexExternalBinding[],
    evidence?: CompileEvidence,
  ): CompiledNativeComponent[]
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
    /** @internal Per-call RFC 006 experiments, not project/bundler configuration.
     * textReference needs private test hosts; textInheritance emits shipped
     * passive Text/View ABI helpers. textStatic additionally proves bounded
     * memo Text regions; failed proofs keep the same runtime ABI.
     */
    experiment?: NativeCompileOptions,
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
  /**
   * Replace what components from the project's dependencies hand a nested
   * Text, from their packages' manifests (#950). Native only: on the Web,
   * CSS inheritance already carries text styles down.
   */
  setTextForwarding(modules: TextForwardingModule[]): void
  /** Replace the project's own class-joining functions (#964); see `./project.ts`. */
  setClassHelpers(helpers: ClassHelper[]): void
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
    compileNativeOrPrepare: (source, context, bindings, sourceFile, options) => {
      validateNativeOptions(options)
      const result = inner.compileNativeOrPrepare(source, context, bindings, sourceFile, options)
      return 'components' in result
        ? { ...result, components: annotateNative(result.components, fontAvailability) }
        : annotatePreparedNative(result, fontAvailability)
    },
    compileWebOrPrepare: (source, context, bindings, options) => {
      const result = inner.compileWebOrPrepare(source, context, bindings, options)
      return Array.isArray(result)
        ? annotateWeb(result, fontAvailability)
        : annotatePreparedWeb(result, fontAvailability)
    },
    prepareWebModule: (source, bindings, options) => {
      const prepared = inner.prepareWebModule(source, bindings, options)
      return annotatePreparedWeb(prepared, fontAvailability)
    },
    prepareNativeModule: (source, bindings, sourceFile, options) => {
      validateNativeOptions(options)
      const prepared = inner.prepareNativeModule(source, bindings, sourceFile, options)
      return annotatePreparedNative(prepared, fontAvailability)
    },
    setTailwindOrder: (snapshot) => inner.setTailwindOrder(snapshot),
    inspectTailwindOrder: (source, bindings, sourceFile) =>
      inner.inspectTailwindOrder(source, bindings, sourceFile),
    compile: (source, bindings, options) =>
      annotateWeb(
        inner.compile(
          source,
          bindings,
          options?.rehomeReactNative ?? false,
          options?.tagEvidence ?? false,
          options?.tailwindPlan ?? false,
        ),
        fontAvailability,
      ),
    compileNative: (source, bindings, evidence) =>
      annotateNative(
        inner.compileNative(source, bindings, evidence?.tailwindPlan ?? false),
        fontAvailability,
      ),
    compileNativeModule: (source, bindings, sourceFile, experiment) => {
      validateNativeOptions(experiment)
      const module = inner.compileNativeModule(source, bindings, sourceFile, experiment)
      return {
        ...module,
        components: annotateNative(module.components, fontAvailability),
      }
    },
    unfoldJsxCalls: (source) => inner.unfoldJsxCalls(source) ?? undefined,
    setStylexModules: (modules) => inner.setStylexModules(modules),
    setTextForwarding: (modules) => inner.setTextForwarding(modules),
    setClassHelpers: (helpers) => inner.setClassHelpers(helpers),
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

/** @internal Explicit caller inspection, not manifest trust or rewrite permission.
 * Named runtime import symbols only. Namespace sites remain unassessed.
 * Coordinates are UTF-16 for edits in the original JS source string.
 */
export interface OwnerSlotBinding {
  source: string
  imported: string
  classProp: string
  preparedProp: string
}
export interface OwnerSlotInspection {
  /** Insert generated module declarations after hashbang/directive prologue. */
  insertionOffset: number
  sites: { target: number; spanStart: number; spanEnd: number; classes?: string; reason?: string }[]
  diagnostics: CompileDiagnostic[]
}
export function inspectOwnerClassSlots(
  source: string,
  targets: OwnerSlotBinding[],
  sourceFile?: string,
): OwnerSlotInspection {
  return loadNative().inspectOwnerClassSlots(source, targets, sourceFile)
}

/**
 * What each component exported from this file hands its children as text
 * styles, read from the file alone. A component whose shape is not one the
 * reader knows has no entry. See `./manifest.ts`.
 */
export function summarizeTextForwarding(source: string): TextForwardingSummary {
  return loadNative().summarizeTextForwarding(source)
}

/**
 * The imports this file calls inside a `className` that are not joiners the
 * compiler already recognizes: the ones worth resolving to see whether they
 * are (#964). See `findClassHelpers` in `./project.ts`.
 */
/**
 * Why React Native cannot draw a class (#1165). `missing` is something the
 * Web draws and Native does not -- a pseudo-element, a scrim, a selector;
 * `cosmetic` is a cursor shape or a CSS transition, which nobody would see
 * as broken. State a component's Native half may supply (`hover:`,
 * `aria-*:`, `data-*:`) is not reported.
 */
export interface NativeClassVerdict {
  kind: 'missing' | 'cosmetic'
  reason: string
}

/** One class in a module's class prop that React Native cannot draw. */
export interface NativeClassFinding extends NativeClassVerdict {
  element: string
  prop: string
  className: string
  spanStart: number
  spanEnd: number
}

/**
 * Every class in the module's `className` and `*ClassName` props, on any
 * element, that React Native cannot draw -- including class lists handed to
 * a pattern such as `BottomSheet`, which the compiler does not lower and
 * so never examined. Values are read as far as the file spells them out:
 * literals, module constants, both arms of a ternary, a joiner's arguments.
 *
 * Unstable: the shape may change while the audit (#1167) and build warnings
 * (#1166) adopt it.
 */
export function nativeClassReport(source: string): NativeClassFinding[] {
  return loadNative().nativeClassReport(source) as NativeClassFinding[]
}

/**
 * The classes the verdict calls missing that the static backend draws on the
 * element they are written on -- `max-h-[85vh]` or `backdrop:bg-*` on a
 * Dialog -- which `nativeClassReport` leaves out. For a reader that also runs
 * loose literals through `nativeClassVerdicts`, so it can leave them out too.
 */
export function nativeClassesDrawnStatically(source: string): string[] {
  return loadNative().nativeClassesDrawnStatically(source)
}

/** The same verdict for loose class names, in order; `null` where Native can draw it. */
export function nativeClassVerdicts(classNames: readonly string[]): (NativeClassVerdict | null)[] {
  return loadNative().nativeClassVerdicts([...classNames]) as (NativeClassVerdict | null)[]
}

export function classHelperCandidates(source: string): { specifier: string; imported: string }[] {
  return loadNative().classHelperCandidates(source)
}

/** @internal Byte-scan an ordering seed without removing static classes.
 * Never feed this set to runtime candidate CSS generation. False positives
 * are allowed; actual parsed completeness still decides ready emission.
 */
export function scanTailwindOrderCandidates(source: string): string[] {
  return loadNative().scanTailwindOrderCandidates(source)
}

/**
 * The names this file exports that only hand their arguments to a joiner
 * the compiler recognizes, as shadcn/ui's `cn` does (#964). `default` for a
 * default export.
 */
export function summarizeClassHelpers(source: string): string[] {
  return loadNative().summarizeClassHelpers(source)
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
