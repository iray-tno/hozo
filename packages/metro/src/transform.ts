// The actual source-rewrite logic, kept separate from `index.ts`'s Metro
// wiring so it's unit-testable in plain Node without needing a running
// Metro/Expo instance (none is available to verify against in this
// environment -- no device/simulator).
//
// Mirrors @hozo/vite's approach (splice compiled JSX at the exact
// span hozo_napi reports, strip the now-unreferenced @hozo/core import)
// with two Native-specific differences:
// - View/Text/Pressable aren't JSX intrinsics on Native the way div/span/
//   button are on Web -- they're real react-native exports, so the
//   stripped @hozo/core import must be replaced with one from
//   'react-native', not just deleted.
// - Styles aren't a separate CSS file/import -- they're inlined as a
//   `const hozoStyles = StyleSheet.create({...})` declaration in the same
//   file, since that's the idiomatic RN pattern.

import path from 'node:path'

import { type CompiledNativeComponent, type Compiler, createCompiler } from '@hozo/compiler'
import { lowerCanvasPaints } from '@hozo/compiler/canvas'
import { reportDiagnostics } from '@hozo/compiler/diagnostics'
import type { StylexModuleCache } from '@hozo/compiler/project'
import { importSpecifier } from '@hozo/compiler/project'
import { candidateModulePath } from './project.ts'

const HOZO_CORE_IMPORT_RE = /import\s*\{[^}]*\}\s*from\s*['"]@hozo\/core['"]\s*\n?/
/// Values the *author* imports from `@hozo/core` that resolve to
/// `react-native` exports. Not components: those arrive through the
/// compiler's own `nativeImports` now.
///
/// The component list that used to live here went missing a `TextInput`
/// for a while, so a compiled TextInput referred to an identifier nothing
/// imported. Metro bundles that happily -- an undefined identifier is only
/// an error when it runs -- so the example built cleanly and would have
/// crashed on first render. Nothing here can go stale that way again: the
/// compiler reports what it emitted.
const RN_VALUE_EXPORTS = ['PanResponder'] as const

/// Renames this component's `hozoN`/`hozoN_suffix` style/JSX identifiers
/// to be unique across every component in the file -- each `compileNative`
/// call starts counting from `hozo0` independently per root, so two
/// components in the same source file would otherwise collide when their
/// styles are merged into one `StyleSheet.create({...})`.
function namespaceHozoIdentifiers(text: string, rootIndex: number): string {
  return text.replace(/\bhozo(\d+)/g, `hozo_r${rootIndex}_$1`)
}

function mergeStyleObjects(blocks: string[]): string {
  if (blocks.length === 1) {
    return blocks[0]!
  }
  const inner = blocks
    .map((block) => block.trim().replace(/^\{/, '').replace(/\}$/, '').trim())
    .join('\n')
  return `{\n${inner}\n}`
}

/// A compiler with no project theme, for the callers that have no project:
/// the unit tests, and anyone calling `transformHozoSource` directly. Made
/// once rather than per call -- it is the palette crossing the addon
/// boundary that this whole shape exists to do only once.
let fallback: Compiler | undefined
function defaultCompiler(): Compiler {
  fallback ??= createCompiler()
  return fallback
}

/**
 * Returns the rewritten source, or `null` if there's nothing for Hozo to
 * do: not a `.tsx` file, or no primitives from a module the project trusts.
 */
export function transformHozoSource(
  code: string,
  filename: string,
  projectRoot?: string,
  compiler: Compiler = defaultCompiler(),
  stylexModules?: StylexModuleCache,
): string | null {
  if (!filename.endsWith('.tsx')) {
    return null
  }
  // A cheap reject before parsing; the real decision needs the AST.
  const hasSemanticCandidate = compiler.sources.some((module) => code.includes(module))
  if (!hasSemanticCandidate && !code.includes('@hozo/canvas')) {
    return null
  }
  const canvas = lowerCanvasPaints(code, compiler, true)
  code = canvas.code
  reportDiagnostics(
    canvas.diagnostics,
    filename,
    // eslint-disable-next-line no-console
    (message) => console.warn(message),
  )
  // `sources` reaches the compiler rather than gating the file here. It
  // was `code.includes('@hozo/core')`, which skipped every Expo and React
  // Native project on the grounds that it had not been rewritten -- while
  // the compiler underneath had always handled `react-native` imports and
  // produced identical output for them. See `@hozo/compiler/sources`.
  // Native lowering and the source binding metadata come from one parser
  // pass. Metro used to call `compileNative`, `foreignPrimitives`, then
  // `moduleImports` over the rewritten source -- three public operations
  // that each parsed the whole module, even though the compiler already
  // held the module record needed to answer all three.
  const stylexBindings = code.includes('@stylexjs/stylex')
    ? stylexModules?.bindingsFor(path.resolve(filename))
    : undefined
  const compiled = hasSemanticCandidate
    ? compiler.compileNativeModule(code, stylexBindings)
    : undefined
  if (!compiled || compiled.components.length === 0) {
    return canvas.touched ? code : null
  }
  const components = compiled.components

  // Error-severity diagnostics stop the build. The case this exists for --
  // a Web-only utility like `block`/`grid` reaching the Native backend --
  // has no correct Native output, so continuing would ship a layout that
  // looks right on Web and is silently wrong on device. The policy itself
  // is shared with every other integration now; see
  // `@hozo/compiler/diagnostics` for why it stopped being Metro's alone.
  reportDiagnostics(
    components.flatMap((component) => component.diagnostics),
    filename,
    // eslint-disable-next-line no-console
    (message) => console.warn(message),
  )

  // Names this file imports from a module the project does not trust, so
  // the guards below can tell a component Hozo declined from one it failed
  // to lower.
  const foreign = new Set(compiled.foreignPrimitives)
  const usedTags = new Set<string>()
  const styleBlocks: string[] = []
  components.forEach((component: CompiledNativeComponent, index: number) => {
    styleBlocks.push(namespaceHozoIdentifiers(component.styles, index))
    // What the compiler says it emitted, rather than what a regular
    // expression can find in what it emitted.
    //
    // The scan this replaces built a fresh `RegExp` per candidate tag per
    // component, tested each against the generated JSX, and then subtracted
    // the names the file imports from a module the project does not trust
    // -- because `<Text>` in the output might be React Native's or might be
    // `@expo/ui`'s carried through verbatim, and the text cannot say which.
    // The compiler can: a carried tag never passed through its lowering at
    // all, so it is not in this list.
    for (const tag of component.nativeImports) usedTags.add(tag)
    // `View`/`Text`/`Pressable` carried through `Child::Verbatim` are fine:
    // they resolve to the react-native imports above, which are the very
    // components Hozo lowers to. `Button` is not -- Hozo's Button is a
    // semantic primitive that lowers to Pressable, while react-native's
    // takes a `title` prop and renders no children. Neither that nor
    // `@hozo/core`'s Web `<button>` fallback works on a device, so this is
    // refused rather than silently mis-rendered.
    //
    // Unless the `Button` is somebody else's. `@expo/ui` exports one too,
    // and a carried `@expo/ui` Button is the correct outcome rather than a
    // failure -- the compiler declined to lower it on purpose, because it
    // is a native SwiftUI control and not a primitive at all.
    if (/<Button[\s/>]/.test(component.jsx) && !foreign.has('Button')) {
      throw new Error(
        `[hozo] ${filename}: a <Button> is inside an expression the compiler can't read, so it ` +
          `can't be lowered -- and React Native's own Button is a different component with a ` +
          `different API. Move it out of the expression, or use Pressable directly.`,
      )
    }
  })
  // Values the author imported from `@hozo/core`, including aliases. The
  // import is stripped below, so these specifiers move to `react-native`.
  // Reading the module record also avoids the old whole-source regex, which
  // could mistake a comment or unrelated identifier for an authored import.
  const nativeValueImports = compiled.imports
    .filter(
      (entry) =>
        entry.source === '@hozo/core' &&
        RN_VALUE_EXPORTS.includes(entry.imported as (typeof RN_VALUE_EXPORTS)[number]),
    )
    .map((entry) => ({
      local: entry.local,
      specifier:
        entry.imported === entry.local ? entry.imported : `${entry.imported} as ${entry.local}`,
    }))

  // Every rewrite as an offset-keyed edit, applied back-to-front so
  // earlier offsets stay valid. Two kinds share the list: replacing a
  // component's JSX, and inserting its hook declarations at the top of the
  // enclosing function.
  const edits: { start: number; end: number; text: string }[] = []
  const runtimeImports = new Set<string>()
  // Two components can live in one function, and both may need the same
  // hook. The binding is function-scoped, so a second `const` would be a
  // redeclaration -- and a second call would change the hook order.
  const declaredPerSlot = new Map<number, Set<string>>()

  components.forEach((component: CompiledNativeComponent, index: number) => {
    edits.push({
      start: component.spanStart,
      end: component.spanEnd,
      text: namespaceHozoIdentifiers(component.jsx, index),
    })

    // Collected before the prelude check, not inside it. Runtime imports
    // used to come only from hooks, which always have a prelude, so the two
    // were folded together -- and then `HozoSpaced` and `HozoDialog`
    // arrived, which need an import and no hook. Every component using
    // `space-*`, `divide-*` or a `Dialog` was emitting a module that
    // referenced an undefined identifier, which nothing caught because
    // nothing ran the output.
    for (const name of component.runtimeImports) {
      runtimeImports.add(name)
    }

    if (component.prelude.length === 0) {
      return
    }
    if (component.hookSlot === null || component.hookSlot === undefined) {
      // A hook needs a statement position. There isn't one at module
      // scope or in a concise arrow body, and inlining the call into the
      // JSX would break the rules of hooks the moment the element sits
      // behind a conditional.
      throw new Error(
        `[hozo] ${filename}: \`dark:\` and breakpoint variants need a React hook, which can ` +
          `only go inside a component function. Move this JSX into a function component with a ` +
          `block body (\`function C() { return <View .../> }\`).`,
      )
    }

    const already = declaredPerSlot.get(component.hookSlot) ?? new Set<string>()
    const fresh = component.prelude.filter((line) => !already.has(line))
    for (const line of fresh) {
      already.add(line)
    }
    declaredPerSlot.set(component.hookSlot, already)
    if (fresh.length > 0) {
      edits.push({
        start: component.hookSlot,
        end: component.hookSlot,
        text: `\n  ${fresh.join('\n  ')}`,
      })
    }
  })

  let next = code
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
  }

  next = next.replace(HOZO_CORE_IMPORT_RE, '')

  // Only the bindings the file does not already have. These came from the
  // same original module record as the compiled roots; none of the edits
  // above changes an existing `react-native` import, so parsing `next` again
  // used to rediscover information that was already stable.
  const alreadyImported = new Set(
    compiled.imports.filter((entry) => entry.source === 'react-native').map((entry) => entry.local),
  )
  const mergedStyles = mergeStyleObjects(styleBlocks)
  // No styles means no declaration, and no `StyleSheet` import to go with
  // it. A React Native file with no Tailwind classes still reaches this --
  // Hozo may have semantic props to add to it -- and it was getting a
  // `const hozoStyles = StyleSheet.create({})` for its trouble, in every
  // such file in the project.
  const hasStyles = mergedStyles.replace(/\s/g, '') !== '{}'
  const needed = [...usedTags, ...(hasStyles ? ['StyleSheet'] : [])].filter(
    (name) => !alreadyImported.has(name),
  )
  const valueSpecifiers = nativeValueImports
    .filter((entry) => !alreadyImported.has(entry.local))
    .map((entry) => entry.specifier)
  const nativeSpecifiers = [...needed, ...valueSpecifiers]
  const rnImport =
    nativeSpecifiers.length > 0
      ? `import { ${nativeSpecifiers.join(', ')} } from 'react-native'\n`
      : ''
  const styleDeclaration = hasStyles
    ? `const hozoStyles = StyleSheet.create(${mergedStyles})\n`
    : ''
  next = `${rnImport}${styleDeclaration}${next}`
  // SVG comes from a subpath rather than the main entry, and that is not
  // tidiness. `react-native-svg` is an optional peer dependency, and a
  // re-export from `@hozo/runtime`'s index would load it on every import
  // of the package -- an optional dependency that is always loaded is not
  // optional, and a project without it would fail on its first component.
  // Splitting the import here is what keeps that promise true.
  const svg = [...runtimeImports].filter((name) => SVG_EXPORTS.has(name))
  const rest = [...runtimeImports].filter((name) => !SVG_EXPORTS.has(name))
  if (rest.length > 0) {
    next = `import { ${rest.join(', ')} } from '@hozo/runtime'\n${next}`
  }
  if (svg.length > 0) {
    next = `import { ${svg.join(', ')} } from '@hozo/runtime/svg'\n${next}`
  }

  // Only when something actually calls it. The candidate module is
  // generated at config time (see `./project.ts`); a file with no
  // unresolvable className must not depend on it having been generated.
  if (next.includes('hozoClasses(')) {
    if (projectRoot === undefined) {
      throw new Error(
        `[hozo] ${filename} has a className the compiler can't read, which needs the generated ` +
          `candidate module -- but no projectRoot was given, so its location is unknown. Call ` +
          `generateCandidateModule(projectRoot) from metro.config.js.`,
      )
    }
    const specifier = importSpecifier(filename, candidateModulePath(projectRoot))
    next = `import { hozoClasses } from '${specifier}'\n${next}`
  }

  return next
}

/**
 * The names `@hozo/runtime/svg` exports, so they can be told apart from
 * the ones on the main entry.
 *
 * Duplicated from that module rather than imported, because this runs in
 * the bundler's process and importing the Native entry would pull
 * `react-native` and `react-native-svg` into it. A list of sixteen names
 * that changes when SVG does, which is roughly never, and the compiler's
 * own `SvgElement` is the source both sides copy from.
 */
const SVG_EXPORTS = new Set([
  'Svg',
  'G',
  'Rect',
  'Circle',
  'Ellipse',
  'Line',
  'Path',
  'Polygon',
  'Polyline',
  'SvgText',
  'Defs',
  'LinearGradient',
  'RadialGradient',
  'Stop',
  'ClipPath',
  'Use',
])
