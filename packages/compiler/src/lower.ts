// The part of "run a source file through Hozo" that has nothing to do with
// any one bundler.
//
// It lived inside `@hozo/vite`'s `transform` until Next.js needed the same
// hundred lines. What is actually bundler-specific turns out to be small --
// where diagnostics go, when files are written, how a companion stylesheet
// is referenced -- and everything else is the same work: compile the
// module, splice each component back at the span the Rust side reported,
// namespace the class names so two components in one file can't collide,
// and decide whether the `@hozo/core` import may go.
//
// Splitting it here rather than having Next import the Vite plugin keeps
// the dependency honest: a Next.js project has no Vite in it.

import path from 'node:path'
import { lowerCanvasPaints } from './canvas.ts'
import type {
  CompileDiagnostic,
  CompiledNativeModule,
  Compiler,
  StylexExternalBinding,
} from './index.ts'
import type { UnloweredReactNativeJsxPolicy } from './project.ts'
import type { StylexModuleCache } from './stylex-project.ts'

export type { UnloweredReactNativeJsxPolicy } from './project.ts'

const PRIMITIVE_RUNTIME_EXPORTS = new Set(['HozoFlatList', 'HozoRefreshControl', 'HozoScrollView'])

/** Render generated component imports according to the package that owns their implementation. */
export function generatedRuntimeImports(names: readonly string[]): string {
  const primitives = names.filter((name) => PRIMITIVE_RUNTIME_EXPORTS.has(name))
  const runtime = names.filter((name) => !PRIMITIVE_RUNTIME_EXPORTS.has(name))
  return [
    runtime.length > 0 ? `import { ${runtime.join(', ')} } from '@hozo/runtime'\n` : '',
    primitives.length > 0 ? `import { ${primitives.join(', ')} } from '@hozo/primitives'\n` : '',
  ].join('')
}

const HOZO_CORE_IMPORT_RE =
  /import\s*\{[^}]*\}\s*from\s*['"](?:@hozo\/core|@hozo\/semantics|@hozo\/typography)['"]\s*\n?/g

const RN_NAMED_IMPORT_RE = /\bimport\s+(type\s+)?\{([^}]*)\}\s+from\s*(['"])react-native\3\s*;?/g

/** React Native value exports whose Web contract Hozo owns when checking unlowered JSX. */
const RN_OWNED_RUNTIME_EXPORTS = new Set([
  'AccessibilityInfo',
  'Dimensions',
  'Keyboard',
  'Platform',
  'StyleSheet',
  'useColorScheme',
  'useWindowDimensions',
])
const RN_OWNED_COMPONENT_EXPORTS = new Set(['Pressable', 'TextInput'])

/**
 * Moves supported value imports out of `react-native` before a Web bundler
 * aliases that package to RNW. Types and unknown values stay on the original
 * declaration; TypeScript/Babel removes type-only specifiers later.
 *
 * This deliberately handles named imports only. A namespace import can read
 * any React Native API dynamically, so splitting it would make an unsafe
 * promise about the whole namespace.
 */
function rehomeReactNativeImports(code: string, owned: ReadonlySet<string>): string {
  return code.replace(
    RN_NAMED_IMPORT_RE,
    (statement, importType: string | undefined, body: string, quote: string) => {
      if (importType) return statement
      const remaining: string[] = []
      const moved: string[] = []
      for (const raw of body.split(',')) {
        const normalized = raw.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').trim()
        const match = /^(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(
          normalized,
        )
        const imported = match?.[2]
        if (!match || match[1] || !imported || !owned.has(imported)) {
          remaining.push(raw)
          continue
        }
        moved.push(match[3] ? `${imported} as ${match[3]}` : imported)
      }
      if (moved.length === 0) return statement
      const original = remaining.some((part) => part.trim() !== '')
        ? `import { ${remaining.map((part) => part.trim()).join(', ')} } from ${quote}react-native${quote}\n`
        : ''
      return `${original}import { ${moved.join(', ')} } from '@hozo/runtime'\n`
    },
  )
}

export function rehomeReactNativeRuntimeImports(code: string): string {
  return rehomeReactNativeImports(code, RN_OWNED_RUNTIME_EXPORTS)
}

export function rehomeReactNativeComponentImports(code: string): string {
  return rehomeReactNativeImports(code, RN_OWNED_COMPONENT_EXPORTS)
}

/** @deprecated Alias for internal backward-compat if needed */
export const lowerRnwFreeRuntimeImports = rehomeReactNativeRuntimeImports

/**
 * The names `@hozo/core`, `@hozo/semantics`, and `@hozo/typography` export. A lowered element never mentions these
 * (it becomes `div`/`span`/`button`), so one surviving in the output came
 * through `Child::Verbatim` -- something the compiler carried rather than
 * understood.
 */
const HOZO_PRIMITIVES = [
  'View',
  'Text',
  'Paragraph',
  'Heading',
  'Section',
  'Article',
  'Nav',
  'Main',
  'Header',
  'Footer',
  'Aside',
  'Search',
  'Figure',
  'Figcaption',
  'Time',
  'Address',
  'List',
  'ListItem',
  'Pressable',
  'Button',
  'Link',
  'TextInput',
  'Dialog',
  'Image',
  'ScrollView',
  'FlatList',
  'PanResponder',
  'Strong',
  'Emphasis',
  'Underline',
  'Strikethrough',
  'Sub',
  'Sup',
  'Code',
  'Small',
  'Mark',
  'NoBreak',
  'Ruby',
  'RubyText',
] as const

/**
 * Whether any Hozo primitive name is still mentioned after lowering.
 *
 * This decides whether the `@hozo/core` import may be removed. Stripping it
 * unconditionally was safe only while unmodeled children were being
 * *deleted*. Now that they're carried, anything the compiler couldn't lower
 * in place survives to the output, and the import is what makes it resolve.
 *
 * Deliberately a word match rather than a `<Tag` match, and deliberately
 * biased toward keeping the import. A primitive can be referenced without
 * ever appearing as a tag (`const Label = Text` then `<Label/>`), and the
 * two failure modes are not symmetric: an unnecessary import is dead weight
 * a bundler drops, while a missing one breaks at runtime. On Web it doesn't
 * even break cleanly -- `Text` is a DOM global (the text-node interface),
 * so React is handed a DOM class where a component belongs and throws
 * something unrelated to the cause. `View` at least gives an honest
 * ReferenceError.
 *
 * The bias goes all the way: the import statement is part of the text this
 * searches, so in practice it always finds a primitive and the import
 * always survives. What actually removes it is the bundler's own
 * unused-specifier elision, once lowering has left nothing referring to it
 * -- which is the same outcome by a route that cannot be wrong. This
 * remains as the check that would keep a *used* one, and it is the reason
 * `PanResponder.create(...)` beside a lowered tree still resolves.
 */
export function referencesHozoPrimitive(code: string): boolean {
  return HOZO_PRIMITIVES.some((name) => new RegExp(`\\b${name}\\b`).test(code))
}

/**
 * A JSX call the automatic runtime produces: `_jsx(Tag, {...})`.
 *
 * Every spelling of it, because they are not interchangeable at runtime
 * and a check that knew only one would be right in production and blind
 * in development. `jsx` takes one child and `jsxs` takes several;
 * `jsxDEV` is what the development runtime exports instead of both, and
 * it is what a Vite dev server actually produced when this was first run
 * against one. The leading underscore is the renamed import MDX and Babel
 * emit; a source that imported the runtime itself would have neither.
 */
const JSX_CALL = /\b_?jsxs?(?:DEV)?\(\s*([A-Za-z_$][\w$]*)\s*,/g

/**
 * Hozo primitives that reached this pass already folded to function calls.
 *
 * Hozo reads JSX. An MDX plugin that is not told `jsx: true` folds the
 * document to `_jsx(View, { className: "p-4" })` before any of this runs,
 * and there is no JSX left to lower -- so every `className` in the file
 * passes through as written.
 *
 * That failure is silent, and worse than it looks. The elements are right,
 * the classes are on them, and a project that also runs Tailwind over the
 * same tree gets rules for those classes anyway -- so the page looks
 * correct and nothing is reported. A Hozo-only project loses the styling
 * for those elements entirely, with no error at build and none at run
 * time. `@astrojs/mdx` is the case that matters: it exposes no `jsx`
 * option at all (#137), so on Astro this is not a setting anybody forgot.
 *
 * Most of it Hozo now compiles. `Compiler.unfoldJsxCalls` writes the calls
 * back as JSX before lowering reads them, and `@hozo/vite` folds them
 * again on the way out -- the step it was already applying to its own
 * output. So this function is no longer the answer to the whole problem;
 * it is the answer to what is left, and it is asked of the *un-folded*
 * text. A call still named here is one with no JSX spelling at all -- a
 * computed prop name, a spread child -- which the un-folder declines
 * rather than approximates.
 *
 * Only names bound from a module the project trusts, because the
 * compiler's own rule is per tag rather than per file -- an `@expo/ui`
 * `Button` folded to a call is not something Hozo was going to lower.
 * Returned sorted and deduplicated, so the message reads the same on every
 * machine.
 */
export function foldedPrimitiveCalls(code: string, sources: readonly string[]): string[] {
  const bound = new Set<string>()
  for (const source of sources) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const importRe = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escaped}['"]`, 'g')
    for (const match of code.matchAll(importRe)) {
      for (const part of (match[1] as string).split(',')) {
        // `View as Box` binds `Box`, which is the name the call site uses.
        const local = part
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim()
        if (local) bound.add(local)
      }
    }
  }
  if (bound.size === 0) return []

  const folded = new Set<string>()
  for (const match of code.matchAll(JSX_CALL)) {
    const name = match[1] as string
    if (bound.has(name)) folded.add(name)
  }
  return [...folded].sort()
}

/** An event handler on a lowered element, which React will not send across a boundary. */
const HANDLER_PROP = /\son[A-Z]\w*=\{/

/**
 * Whether this module's output needs client-side JavaScript to be itself.
 *
 * A fact about what was emitted, not a diagnostic about where it will be
 * used -- and the difference is the whole design. Whether a module *is* a
 * server component cannot be read from the module: `'use client'` marks a
 * boundary, and a client component reached from another client component
 * carries no directive, which is the common case. So this says what the
 * output needs and leaves who needs to hear about it to the caller.
 *
 * Three things make an answer of `true`, each read from what was actually
 * emitted:
 *
 *   - a `@hozo/runtime` import. `hozoInteractive`, `hozoScrollable` and
 *     `Dialog` are script by definition.
 *   - an event handler on a lowered element. `<Button onPress>` becomes
 *     `<button onClick={...}>`, and React refuses to pass a function from
 *     a server component to a DOM element.
 *   - a primitive the backend carried rather than lowered, `FlatList`
 *     being the one the Web backend always carries. That runs
 *     `@hozo/core`'s own component, and importing that module at all is
 *     what Next's App Router rejects.
 *
 * Biased toward `true`, deliberately and asymmetrically. A false `true`
 * costs a warning about a component that would have been fine. A false
 * `false` is a button rendered into a static Astro page with its handler
 * dropped -- no error at build, none at run time, and a UI that looks
 * correct and does nothing. That is why the third test is
 * `referencesHozoPrimitive`, a word match rather than a tag match: it says
 * yes to `const Label = Text`, and to a paragraph that happens to contain
 * the word.
 */
export function outputNeedsClientBoundary(
  components: readonly { jsx: string; runtimeImports: string[] }[],
): boolean {
  return components.some(
    (component) =>
      component.runtimeImports.length > 0 ||
      HANDLER_PROP.test(component.jsx) ||
      referencesHozoPrimitive(component.jsx),
  )
}

/**
 * Renames this component's `hozo-N` class names to be unique across every
 * component in the project.
 *
 * `compile()` starts counting from `hozo-0` independently per root, so two
 * components in the same source file would collide once their CSS is merged
 * into one companion file. `rootIndex` settles that half.
 *
 * `scope` settles the other half, and it was missing. Every *module* also
 * started again at `hozo-r0-0`, and the companion stylesheets are all
 * loaded into one document -- so a page holding two compiled modules had
 * two unrelated rule sets answering to `.hozo-r0-8`, and the one that
 * loaded last styled both. In the Storybook demo that made an `<article>`
 * whose only class was `space-y-2` come out on a red background: the
 * destructive button's rules, from another file entirely.
 *
 * `hozo-view` and the other wordless base classes are intentionally shared
 * and must NOT be touched by this; the digits are what makes a name local.
 *
 * The lookahead rather than `\b` so a name that already carries a scope
 * cannot be rewritten a second time -- an all-digit hash would otherwise
 * read as the counter.
 */
export function namespaceHozoClasses(text: string, rootIndex: number, scope: string): string {
  return text.replace(/\bhozo-(\d+)(?![\w-])/g, `hozo-${scope}-r${rootIndex}-$1`)
}

/**
 * What makes one module's class names its own.
 *
 * Keyed on the module's path *relative to the project root*, so the same
 * source compiles to the same class names on every machine: a developer's
 * checkout, CI, and a colleague's clone all agree, and a diff between two
 * builds' CSS means what it looks like it means. Hashing the absolute id
 * would have cost nothing to write and quietly made the output
 * machine-dependent.
 *
 * The query survives. Route-splitting frameworks transform several
 * query-qualified modules from one file and each owns different JSX -- the
 * same reason their stylesheets need separate paths, one layer down.
 */
export function moduleScope(root: string, file: string, id: string): string {
  const query = id.includes('?') ? id.slice(id.indexOf('?')) : ''
  const relative = (root ? path.relative(root, file) : file).replaceAll('\\', '/')
  return moduleIdHash(relative + query)
}

/**
 * A stable short hash of a module id.
 *
 * Route-splitting frameworks transform several query-qualified modules from
 * one source file, and each derived module owns different JSX -- so sharing
 * one companion stylesheet path would make the last transform overwrite the
 * others' CSS.
 */
export function moduleIdHash(id: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index++) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * The stylesheet a module of this name writes beside itself.
 *
 * Exported because a bundler may need the name *before* the module is
 * compiled. Turbopack resolves a module's imports against a view of the
 * directory it took earlier, so a stylesheet the loader writes and then
 * imports in the same pass does not exist as far as the resolver is
 * concerned -- `@hozo/next` creates these empty up front for the same
 * reason it already creates `candidates.css` empty up front.
 *
 * Only the plain form. A derived module's name carries a hash of an id
 * that does not exist until something asks for it, so those cannot be
 * predicted and are not pre-created.
 */
export function cssFileNameFor(file: string): string {
  return `${path.basename(file)}.hozo.css`
}

export function sideEffectImport(specifier: string): string {
  return `import ${JSON.stringify(specifier)}\n`
}

export interface LoweredModule {
  /** The source with every compiled component spliced back in. */
  code: string
  /** Every component's CSS, concatenated in source order. */
  css: string
  /** The companion stylesheet's file name, unique per derived module. */
  cssFileName: string
  /** Its absolute path, next to the source file. */
  cssPath: string
  /**
   * Whether the emitted output needs client-side JavaScript.
   *
   * See `outputNeedsClientBoundary`. A fact about the output, not a
   * claim about where the module will be used.
   */
  needsClientBoundary: boolean
  diagnostics: CompileDiagnostic[]
}

export interface LowerModuleOptions {
  /**
   * What to do when Web output still contains JSX backed directly
   * by React Native after Hozo lowering.
   */
  unloweredReactNativeJsx?: UnloweredReactNativeJsxPolicy
}

function runtimeImportOnlyModule(code: string, id: string, file: string): LoweredModule {
  const isDerivedModule = id.includes('?')
  const cssFileName = isDerivedModule
    ? `${path.basename(file)}.${moduleIdHash(id)}.hozo.css`
    : cssFileNameFor(file)
  return {
    code,
    css: '',
    cssFileName,
    cssPath: path.join(path.dirname(file), cssFileName),
    needsClientBoundary: false,
    diagnostics: [],
  }
}

/** Direct React Native imports that are still used as JSX tag roots. */
function directReactNativeJsxBindings(module: CompiledNativeModule): string[] {
  const used = new Set(module.jsxBindings)
  return [
    ...new Set(
      module.imports
        .filter((entry) => entry.source === 'react-native' && used.has(entry.local))
        .map((entry) =>
          entry.imported === entry.local ? entry.local : `${entry.imported} as ${entry.local}`,
        ),
    ),
  ].sort()
}

/**
 * Enforces the policy on unlowered React Native JSX elements in emitted Web source.
 *
 * This deliberately uses the parser's binding metadata rather than a tag
 * regexp: comments and type arguments are not JSX, aliases must be named by
 * their actual local binding, and `Animated.View` is rooted at the namespace
 * import. The extra parse exists only when policy is 'warn' or 'error', so
 * the default 'allow' build path incurs zero overhead.
 */
function checkUnloweredReactNativeJsx(
  code: string,
  file: string,
  compiler: Compiler,
  policy: UnloweredReactNativeJsxPolicy | undefined,
  bindings?: StylexExternalBinding[],
): CompileDiagnostic | undefined {
  if (!policy || policy === 'allow') return undefined
  const residue = directReactNativeJsxBindings(compiler.compileNativeModule(code, bindings))
  if (residue.length === 0) return undefined
  const message =
    `Web output still contains JSX backed directly by 'react-native' after lowering: ` +
    `${residue.join(', ')}. These elements require a React Native Web-compatible ` +
    `fallback, or lower them to Hozo primitives.`
  if (policy === 'error') {
    throw new Error(`[hozo] ${file}: UNLOWERED_REACT_NATIVE_JSX: ${message}`)
  }
  return {
    code: 'UNLOWERED_REACT_NATIVE_JSX',
    severity: 'warning',
    message,
    spanStart: 0,
    spanEnd: 0,
  }
}

/**
 * Lowers one module, or `undefined` when there is nothing to lower.
 *
 * `undefined` rather than an unchanged result on purpose: a caller that
 * returns the source it was given still marks the module as transformed,
 * and the distinction matters to Next's loader chain.
 */
export function lowerModule(
  code: string,
  id: string,
  file: string,
  compiler: Compiler,
  root: string,
  stylexModules?: StylexModuleCache,
  options: LowerModuleOptions = {},
): LoweredModule | undefined {
  // `.mdx` alongside `.tsx` because by the time this runs the MDX
  // transform has already turned the file into JSX; the extension is all
  // that still says where it came from. See `TRANSFORMABLE`.
  const isTransformed = file.endsWith('.mdx')
  const policy = options.unloweredReactNativeJsx
  const shouldRehome = policy === 'warn' || policy === 'error'
  const apiLowered = shouldRehome ? rehomeReactNativeRuntimeImports(code) : code
  const loweredApiImport = apiLowered !== code
  if (!file.endsWith('.tsx') && !isTransformed) {
    const componentLowered = shouldRehome
      ? rehomeReactNativeComponentImports(apiLowered)
      : apiLowered
    if (componentLowered !== apiLowered) return runtimeImportOnlyModule(componentLowered, id, file)
    return loweredApiImport ? runtimeImportOnlyModule(apiLowered, id, file) : undefined
  }

  const allowed = compiler.sources
  const canvas = lowerCanvasPaints(apiLowered, compiler, false)
  // A cheap reject before parsing: a file mentioning none of the trusted
  // modules has nothing this can lower, and most of a project's files are
  // that. The real decision needs the AST and comes next.
  const hasSemanticCandidate = allowed.some((module) => code.includes(module))
  if (!hasSemanticCandidate && !canvas.touched) {
    let diagnostic: CompileDiagnostic | undefined
    if (shouldRehome && apiLowered.includes('react-native')) {
      diagnostic = checkUnloweredReactNativeJsx(apiLowered, file, compiler, policy)
    }
    if (loweredApiImport || diagnostic) {
      const mod = runtimeImportOnlyModule(canvas.code, id, file)
      if (diagnostic) mod.diagnostics.push(diagnostic)
      return mod
    }
    return undefined
  }

  // Per tag, not per file. A file mixing `react-native` with `@expo/ui`
  // is ordinary in an Expo app, and both export `Text`, `Button`, `List`,
  // `ListItem`, `ScrollView` and `TextInput` -- so refusing the whole file
  // left the half Hozo understands uncompiled, and accepting it would have
  // replaced a native SwiftUI button with a `<div>`. The compiler carries
  // a foreign tag verbatim and lowers the tree around it.
  // Canvas edits run first because a semantic root may carry a Canvas tree
  // verbatim. Compiling the semantic span from the original source would
  // otherwise paste the old className back over the nested Canvas edit.
  const stylexBindings = canvas.code.includes('@stylexjs/stylex')
    ? stylexModules?.bindingsFor(path.resolve(file))
    : undefined
  const components = hasSemanticCandidate ? compiler.compile(canvas.code, stylexBindings) : []
  if (components.length === 0 && !canvas.touched) {
    const componentLowered = shouldRehome
      ? rehomeReactNativeComponentImports(canvas.code)
      : canvas.code
    const diagnostic = checkUnloweredReactNativeJsx(
      componentLowered,
      file,
      compiler,
      policy,
      stylexBindings,
    )
    if (componentLowered !== canvas.code || loweredApiImport || diagnostic) {
      const mod = runtimeImportOnlyModule(componentLowered, id, file)
      if (diagnostic) mod.diagnostics.push(diagnostic)
      return mod
    }
    return undefined
  }

  let next = canvas.code
  let css = ''
  // Splice from the last span to the first so earlier offsets stay valid as
  // later (in the string, not necessarily in array order) edits are applied.
  const bySpanDescending = components
    .map((component, index) => ({ component, index }))
    .sort((a, b) => b.component.spanStart - a.component.spanStart)
  const scope = moduleScope(root, file, id)
  for (const { component, index } of bySpanDescending) {
    const jsx = namespaceHozoClasses(component.jsx, index, scope)
    const componentCss = namespaceHozoClasses(component.css, index, scope)
    next = next.slice(0, component.spanStart) + jsx + next.slice(component.spanEnd)
    css = componentCss + css
  }

  // Only when nothing needs it. A primitive that survived lowering (carried
  // through `Child::Verbatim`) still has to resolve, and `@hozo/core`
  // exports real working React components for exactly this -- proposal
  // §2.3's "fall back gracefully".
  //
  // For a transformed source the question is asked of the text with the
  // import statement itself removed, because for those files nobody else
  // will ask it. `referencesHozoPrimitive` searches text that includes the
  // import, so it always finds a name and the import always survives --
  // deliberately, since every bundler elides an unused specifier
  // afterwards. Every bundler elides it *for a file whose extension says
  // TypeScript*: SWC and oxc both decide that from the name, and `.mdx`
  // is not one. The import then reaches the graph, `@hozo/core` is pulled
  // in, and Next's App Router rejects the page for calling `useState` in a
  // server component -- naming neither MDX nor the import.
  const withoutImport = next.replace(HOZO_CORE_IMPORT_RE, '')
  if (!referencesHozoPrimitive(isTransformed ? withoutImport : next)) {
    next = withoutImport
  }

  // One import for the whole module, after the splicing so it lands at
  // the top of the file rather than inside a span. Metro does the same for
  // the Native backend's hooks; this is the Web half of that contract.
  const runtimeImports = [...new Set(components.flatMap((component) => component.runtimeImports))]
  if (runtimeImports.length > 0) {
    next = `${generatedRuntimeImports(runtimeImports.sort())}${next}`
  }

  if (shouldRehome) next = rehomeReactNativeComponentImports(next)
  const unloweredDiagnostic = checkUnloweredReactNativeJsx(
    next,
    file,
    compiler,
    policy,
    stylexBindings,
  )

  const isDerivedModule = id.includes('?')
  const cssFileName = isDerivedModule
    ? `${path.basename(file)}.${moduleIdHash(id)}.hozo.css`
    : cssFileNameFor(file)

  const diagnostics = [
    ...canvas.diagnostics,
    ...components.flatMap((component) => component.diagnostics),
  ]
  if (unloweredDiagnostic) {
    diagnostics.push(unloweredDiagnostic)
  }

  return {
    code: next,
    css,
    cssFileName,
    cssPath: path.join(path.dirname(file), cssFileName),
    needsClientBoundary: outputNeedsClientBoundary(components),
    diagnostics,
  }
}
