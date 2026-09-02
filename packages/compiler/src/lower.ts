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
import type { CompileDiagnostic, Compiler } from './index.ts'
import type { StylexModuleCache } from './stylex-project.ts'

const HOZO_CORE_IMPORT_RE = /import\s*\{[^}]*\}\s*from\s*['"]@hozo\/core['"]\s*\n?/

/**
 * The names `@hozo/core` exports. A lowered element never mentions these
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
  diagnostics: CompileDiagnostic[]
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
): LoweredModule | undefined {
  // `.mdx` alongside `.tsx` because by the time this runs the MDX
  // transform has already turned the file into JSX; the extension is all
  // that still says where it came from. See `TRANSFORMABLE`.
  const isTransformed = file.endsWith('.mdx')
  if (!file.endsWith('.tsx') && !isTransformed) return undefined

  const allowed = compiler.sources
  const canvas = lowerCanvasPaints(code, compiler, false)
  // A cheap reject before parsing: a file mentioning none of the trusted
  // modules has nothing this can lower, and most of a project's files are
  // that. The real decision needs the AST and comes next.
  const hasSemanticCandidate = allowed.some((module) => code.includes(module))
  if (!hasSemanticCandidate && !canvas.touched) return undefined

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
  if (components.length === 0 && !canvas.touched) return undefined

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
    next =
      `import { ${runtimeImports.sort().join(', ')} } from '@hozo/runtime'
` + next
  }

  const isDerivedModule = id.includes('?')
  const cssFileName = isDerivedModule
    ? `${path.basename(file)}.${moduleIdHash(id)}.hozo.css`
    : cssFileNameFor(file)

  return {
    code: next,
    css,
    cssFileName,
    cssPath: path.join(path.dirname(file), cssFileName),
    diagnostics: [
      ...canvas.diagnostics,
      ...components.flatMap((component) => component.diagnostics),
    ],
  }
}
