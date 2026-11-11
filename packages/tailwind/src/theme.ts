// Reads a project's design tokens out of its Tailwind setup.
//
// This is what `@hozo/tailwind` is for (proposal §6.2): Tailwind is the
// frontend, the Style IR is the internal representation, and this is the
// boundary between them. The utility-to-IR translation lives in Rust and
// stays there; what a JavaScript package can do that Rust can't is ask
// Tailwind itself what the project's theme is.
//
// Asking rather than parsing matters. A `@theme` block can import other
// files, extend the default palette, or redefine part of it, and the only
// thing that resolves all of that correctly is Tailwind. So the project's
// CSS goes in, Tailwind's own design system comes out, and this reads the
// custom properties off it.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { converter, formatHex } from 'culori'
import { __unstable__loadDesignSystem } from 'tailwindcss'
import {
  describeTailwindOrder,
  orderByFirstRule,
  orderingHash,
  type PreparedTailwindOrder,
} from './ordering.ts'
import { assertStaticStylesheet, ExecutableStylesheetError } from './static-css.ts'

export interface ThemeColor {
  token: string
  /** Resolved CSS color, also used for Canvas paint. */
  oklch: string
  /** React Native's style system has no `oklch()`, so it takes this. */
  hex: string
  /** What the token becomes under `prefers-color-scheme: dark`, if paired. */
  dark?: { oklch: string; hex: string }
}

/**
 * The suffix that pairs a token with its dark value.
 *
 * A naming convention rather than a media query, and that was measured
 * rather than preferred. Tailwind's design system reports one value per
 * theme key, so
 *
 *   @theme { --color-brand: <light> }
 *   @media (prefers-color-scheme: dark) { @theme { --color-brand: <dark> } }
 *
 * comes back as a single `--color-brand` holding the *dark* value -- the
 * light one is gone before this can see it. The two-key form survives
 * because they are two keys.
 *
 * Read through Tailwind's own entries either way, which is the rule this
 * file is built on: a `@theme` can import, extend and redefine, and the
 * only thing that resolves all of it correctly is Tailwind.
 */
export const DARK_SUFFIX = '--dark'

/**
 * One of a project's own animations: `--animate-<name>` in its `@theme`,
 * and the `@keyframes` its value names (decision 007, slice 3).
 */
export interface ThemeAnimation {
  /** `wiggle`, for `--animate-wiggle` and the class `animate-wiggle`. */
  name: string
  /** The `animation` shorthand: `wiggle 1s ease-in-out infinite`. */
  shorthand: string
  /** The `@keyframes` rule as CSS, emitted as it is on the Web. */
  keyframesCss?: string
  /** The same rule's frames, which Native reads into typed properties. */
  frames?: { selector: string; declarations: [string, string][] }[]
}

export interface Theme {
  colors: ThemeColor[]
  /** Web declarations for project colors, including colors resolved only by CSS. */
  webColors?: { token: string; value: string; dark?: string }[]
  /** Theme declarations eligible for delivery at their root scope when referenced. */
  webVariables?: { name: string; value: string }[]
  /**
   * The project's own animations. Tailwind's four (`spin`, `ping`,
   * `pulse`, `bounce`) are left out: Hozo implements those itself, on
   * the native driver.
   */
  animations?: ThemeAnimation[]
  /**
   * One spacing step in pixels. Tailwind's `--spacing` is a length, and
   * every spacing utility is a multiple of it, so a project that changes
   * it changes every padding, margin and gap at once -- which is why
   * getting this wrong was silent: the output was an ordinary padding, at
   * the wrong size.
   */
  spacingPx?: number
  /**
   * The project's radius tokens in pixels: `control` for `--radius-control`,
   * which `rounded-control` reads. Built-in names such as `lg` override the
   * scale too. A value that is not a plain length after its `var()` chain is
   * followed is left out: custom names stay unresolved, while built-in names
   * keep their defaults.
   */
  radii?: ThemeRadius[]
  /** `--shadow-<name>` as the box-shadow value its `var()` chain reaches. */
  shadows?: { name: string; value: string }[]
  /** Values remain visible even when a Native font cannot represent them. */
  fontWeights?: { name: string; value: string }[]
  /** `--font-<name>` for `font-sans`, `font-serif` and `font-mono` (#1691). */
  fontFamilies?: { name: string; web: string; value: string }[]
  /**
   * The project's `dark` variant, when it declared its own with
   * `@custom-variant dark`: a selector with `&` for the element, or an
   * at-rule. Absent for Tailwind's default, `prefers-color-scheme` (#1654).
   */
  darkSelector?: string
}

export interface ThemeRadius {
  name: string
  px: number
}

const toRgb = converter('rgb')
// ThemeOptions.REFERENCE in Tailwind's design-system API has no runtime export.
const THEME_REFERENCE = 2

/**
 * One design system per stylesheet, because two callers want it now.
 *
 * Building it reads and runs the project's Tailwind entry -- not free, and
 * the same answer every time for the same input. The theme and the class
 * order are two questions about one object.
 */
const designSystems = new Map<
  string,
  Promise<Awaited<ReturnType<typeof __unstable__loadDesignSystem>>>
>()

export interface ThemeLoadOptions {
  /** Project watch epochs must re-read imports, not reuse an entry-text cache. */
  fresh?: boolean
  /** Refuse executable directives before Tailwind sees entry or imported CSS. */
  staticOnly?: boolean
  /** Read evidence, including the entry, for this invocation (no cache). */
  onStylesheet?: (file: string, content: string) => void
  file?: string
}

function designSystemFor(css: string, base: string, options: ThemeLoadOptions = {}) {
  if (options.staticOnly) return staticDesignSystem(css, base, options)
  const key = `${base}\u0000${css}`
  let pending = options.fresh ? undefined : designSystems.get(key)
  if (!pending) {
    pending = __unstable__loadDesignSystem(css, {
      base,
      // `from` is a *base directory*, not a file: Tailwind hands back the
      // `base` each stylesheet reported, and the first one is the base this
      // design system was built with. Taking its `dirname` -- which this did
      // -- resolved every relative import one level too high, and went
      // unnoticed because until now no project imported anything but
      // `tailwindcss`, which is answered without looking at `from` at all.
      loadStylesheet: async (id: string, from: string) => {
        const file = stylesheetPath(id, from)
        return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
      },
    })
    if (!options.fresh) designSystems.set(key, pending)
  }
  return pending
}

type StylesheetReader = (
  id: string,
  from: string,
) => { path: string; base: string; content: string }

async function staticDesignSystem(
  css: string,
  base: string,
  options: ThemeLoadOptions,
  read: StylesheetReader = (id, from) => {
    const file = stylesheetPath(id, from)
    return { path: file, base: path.dirname(file), content: readFileSync(file, 'utf8') }
  },
) {
  const inspect = (file: string, content: string) => {
    options.onStylesheet?.(file, content)
    assertStaticStylesheet(content, file)
  }
  inspect(options.file ?? path.join(base, '<entry>'), css)
  let failure: unknown
  let reads = 0
  const design = await __unstable__loadDesignSystem(css, {
    base,
    loadStylesheet: async (id, from) => {
      try {
        // Bound cyclic/excessive import expansion without writing a cache.
        if (++reads > 256)
          throw new ExecutableStylesheetError('CSS import limit exceeded; not assessed')
        const stylesheet = read(id, from)
        inspect(stylesheet.path, stylesheet.content)
        return stylesheet
      } catch (error) {
        failure ??= error
        throw error
      }
    },
    // Defence in depth: explicit refusal, even if Tailwind adds another module
    // loading construct. This callback never imports or requires app code.
    loadModule: async (id, from, kind) => {
      const error = new ExecutableStylesheetError(`${from}: ${kind} ${id} is not assessed`)
      failure ??= error
      throw error
    },
  })
  // Some design-system queries tolerate loader failures. Tolerating one must
  // never turn an unsafe/incomplete theme into a trustworthy analysis result.
  if (failure) throw failure
  return design
}

/**
 * `candidates`, in the order Tailwind would emit them.
 *
 * Every utility in the candidate stylesheet is a single class, so they all
 * carry the same specificity and the order they are written in *is* the
 * cascade. A sorted candidate set is alphabetical, which puts `2xl:` first
 * and `sm:` after `md:` -- so `className="hidden sm:block md:hidden"`
 * stayed visible past `md`, which is the most ordinary responsive idiom
 * there is.
 *
 * Asked rather than reproduced, for the same reason the theme is. The
 * order is not only about breakpoints: `flex` precedes `p-4`, and
 * `hover:` precedes `sm:`. Reproducing it in Rust would mean copying
 * Tailwind's whole utility registration order and then keeping the copy
 * honest.
 *
 * A candidate Tailwind gives no position -- the scan is expected to turn
 * up tokens that only looked like classes -- keeps its place relative to
 * the others and goes last.
 */
export async function loadClassOrder(
  css: string,
  base: string,
  candidates: readonly string[],
  options: Pick<ThemeLoadOptions, 'fresh'> = {},
): Promise<string[]> {
  const design = await designSystemFor(css, base, options)
  const order = new Map(design.getClassOrder([...candidates]))
  return orderByFirstRule(candidates, (name) => order.get(name) ?? null)
}

/**
 * Collect once, prepare asynchronously, then synchronously look up immutable
 * rule descriptors. Not connected to production lowering yet (RFC 007).
 *
 * Always use the existing read-only loader: imported CSS is re-read and
 * executable configuration is refused, not silently replaced with defaults.
 * Callers may cache the result against its full stylesheet/universe receipt;
 * no entry-text-only persistent cache can safely stand in for that receipt.
 */
export async function prepareTailwindOrder(
  css: string,
  base: string,
  candidates: readonly string[],
  options: Pick<ThemeLoadOptions, 'file' | 'onStylesheet'> = {},
): Promise<PreparedTailwindOrder> {
  const observed = [...candidates]
  const stylesheets = new Map<string, string>()
  const design = await designSystemFor(css, base, {
    ...options,
    staticOnly: true,
    onStylesheet: (file, content) => {
      stylesheets.set(path.resolve(file), orderingHash(content))
      options.onStylesheet?.(file, content)
    },
  })
  const version = JSON.parse(readFileSync(path.join(tailwindPackageDir(), 'package.json'), 'utf8'))
    .version as string
  return describeTailwindOrder(
    design,
    observed,
    version,
    [...stylesheets].map(([file, sha256]) => ({ file, sha256 })),
  )
}

/**
 * Loads the theme a stylesheet defines.
 *
 * `css` is the project's entry stylesheet -- the file with
 * `@import "tailwindcss"` and its `@theme` block. `base` is the directory
 * imports resolve against, which is the file's own directory in every
 * ordinary setup.
 */
export async function loadTheme(
  css: string,
  base: string,
  options?: ThemeLoadOptions,
): Promise<Theme> {
  const design = await designSystemFor(css, base, options)

  return themeFromDesign(design)
}

function themeFromDesign(design: Awaited<ReturnType<typeof __unstable__loadDesignSystem>>): Theme {
  const declared = new Map<string, string>()
  for (const [name, value] of design.theme.entries()) {
    declared.set(name, String(value.value).trim())
  }

  const colors: ThemeColor[] = []
  const webColors: NonNullable<Theme['webColors']> = []
  const webVariables: NonNullable<Theme['webVariables']> = []
  for (const [name, value] of declared) {
    // Inline declarations can still be dependencies of other variables.
    // Reference-only imports leave declaration delivery to their stylesheet.
    const key = design.theme.prefix ? name.replace(`--${design.theme.prefix}-`, '--') : name
    if (!(design.theme.getOptions(key) & THEME_REFERENCE)) {
      webVariables.push({ name, value })
    }
  }
  for (const [name, declaration] of declared) {
    if (!name.startsWith('--color-')) continue
    // The dark half of a pair is not a colour of its own: it is read below,
    // through the token it belongs to, and listing it as well would offer
    // `bg-brand--dark` as a utility beside `bg-brand`.
    if (name.endsWith(DARK_SUFFIX)) continue
    const token = name.slice('--color-'.length)
    const oklch = dereference(declaration, declared)
    const hex = toHex(oklch)
    const darkToken = `${token}${DARK_SUFFIX}`
    const paired = declared.get(`--color-${darkToken}`)
    const darkOklch = paired === undefined ? null : dereference(paired, declared)
    const darkHex = darkOklch === null ? null : toHex(darkOklch)
    // A default is still a CSS variable a selector can override. Tailwind's
    // resolver decides whether to reference it or use an inline declaration.
    const value = design.theme.resolve(token, ['--color'])
    const dark =
      hex !== null && darkHex !== null && darkOklch !== null
        ? design.theme.resolve(darkToken, ['--color'])
        : undefined
    if (value !== null) webColors.push({ token, value, ...(dark && { dark }) })
    // Native and Canvas still need a color that can be resolved at build time.
    if (hex === null) continue
    colors.push({
      token,
      oklch,
      hex,
      // A dark value that will not convert is left out for the same reason
      // its light half would be: the backends have a defined answer for an
      // absent token, and none for a colour that is nearly right.
      ...(darkOklch !== null && darkHex !== null
        ? { dark: { oklch: darkOklch, hex: darkHex } }
        : {}),
    })
  }
  return {
    colors,
    ...(webColors.length > 0 && { webColors }),
    ...(webVariables.length > 0 && { webVariables }),
    spacingPx: readSpacing(design),
    animations: readAnimations(design, declared),
    radii: readRadii(declared),
    shadows: readShadows(declared),
    fontWeights: [...declared]
      .filter(([name]) => name.startsWith('--font-weight-'))
      .map(([name, value]) => ({
        name: name.slice('--font-weight-'.length),
        value: dereference(value, declared),
      })),
    fontFamilies: readFontFamilies(design, declared),
    ...readDarkSelector(design),
  }
}

/**
 * The project's `dark` variant, read by asking Tailwind to write one.
 *
 * Tailwind accepts `@custom-variant dark` as a selector, an at-rule or a
 * block with `@slot`, and resolves all three into the rule it emits for a
 * candidate. So this asks it for `dark:flex` and reads where the class
 * ended up, rather than parsing the declaration a second, worse way. The
 * default is left out, so a project that never mentions it sends nothing.
 *
 * Only the shapes a backend can apply are read: one selector around the
 * class, or one at-rule around it. A variant that is both, or nested more
 * deeply, is left out and so stays `prefers-color-scheme`.
 */
function readDarkSelector(design: Awaited<ReturnType<typeof __unstable__loadDesignSystem>>): {
  darkSelector?: string
} {
  const css = design.candidatesToCss(['dark:flex'])[0] ?? ''
  const lines = css
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.endsWith('{'))
    .map((line) => line.slice(0, -1).trim())
  const at = lines.findIndex((line) => line.includes(DARK_PROBE))
  const line = lines[at]
  if (line === undefined) return {}
  const selector = line.replaceAll(DARK_PROBE, '&')
  const [wrapper, ...more] = lines.slice(0, at)
  if (wrapper === undefined && selector !== '&') return { darkSelector: selector }
  if (wrapper?.startsWith('@') && more.length === 0 && selector === '&') {
    return wrapper === DEFAULT_DARK ? {} : { darkSelector: wrapper }
  }
  return {}
}

/** How `dark:flex`'s class is spelled in the CSS Tailwind writes for it. */
const DARK_PROBE = '.dark\\:flex'
const DEFAULT_DARK = '@media (prefers-color-scheme: dark)'

/** @internal Captured CSS, not the process-wide entry-text cache. A new
 * design system per universe prevents Tailwind's mutable variant registry
 * from making a result depend on candidates prepared earlier in the epoch.
 */
export async function captureTailwindStylesheet(css: string, base: string, file: string) {
  const contents = new Map<string, string>([[path.resolve(file), css]])
  const imports = new Map<string, ReturnType<StylesheetReader>>()
  let capturing = true
  const read: StylesheetReader = (id, from) => {
    const key = JSON.stringify([from, id])
    const captured = imports.get(key)
    if (captured) return captured
    if (!capturing) throw new Error(`Stylesheet was not captured: ${id} from ${from}`)
    const resolved = path.resolve(stylesheetPath(id, from))
    let content = contents.get(resolved)
    if (content === undefined) {
      content = readFileSync(resolved, 'utf8')
      contents.set(resolved, content)
    }
    const stylesheet = { path: resolved, base: path.dirname(resolved), content }
    imports.set(key, stylesheet)
    return stylesheet
  }
  const options = { file, staticOnly: true }
  const design = await staticDesignSystem(css, base, options, read)
  capturing = false
  return capturedStylesheet(css, base, file, contents, imports, design)
}

/** @internal Transport captured bytes across build-tool worker processes.
 * Import edges, not a new resolver: restoration must never consult project
 * files, even if they were edited or removed after the config was evaluated.
 */
export async function restoreTailwindStylesheet(serialized: string) {
  const data = JSON.parse(serialized) as {
    schema: number
    base: string
    file: string
    tailwindVersion: string
    contents: [string, string][]
    imports: [string, string][]
  }
  if (
    data?.schema !== 1 ||
    typeof data.base !== 'string' ||
    typeof data.file !== 'string' ||
    data.tailwindVersion !== tailwindVersion() ||
    !Array.isArray(data.contents) ||
    !Array.isArray(data.imports)
  ) {
    throw new Error('Invalid or incompatible captured Tailwind stylesheet')
  }
  const pairs = (entries: [string, string][]) => {
    const values = new Map<string, string>()
    for (const pair of entries) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        pair.some((value) => typeof value !== 'string') ||
        values.has(pair[0])
      ) {
        throw new Error('Invalid captured Tailwind stylesheet entries')
      }
      values.set(pair[0], pair[1])
    }
    return values
  }
  const contents = pairs(data.contents)
  const css = contents.get(data.file)
  if (css === undefined) throw new Error('Captured Tailwind entry is missing')
  const imports = new Map<string, ReturnType<StylesheetReader>>()
  for (const [key, file] of pairs(data.imports)) {
    const content = contents.get(file)
    if (content === undefined) throw new Error(`Captured Tailwind import is missing: ${file}`)
    imports.set(key, { path: file, base: path.dirname(file), content })
  }
  const read: StylesheetReader = (id, from) => {
    const captured = imports.get(JSON.stringify([from, id]))
    if (!captured) throw new Error(`Stylesheet was not captured: ${id} from ${from}`)
    return captured
  }
  const design = await staticDesignSystem(css, data.base, { file: data.file }, read)
  return capturedStylesheet(css, data.base, data.file, contents, imports, design)
}

function tailwindVersion(): string {
  return JSON.parse(readFileSync(path.join(tailwindPackageDir(), 'package.json'), 'utf8')).version
}

function capturedStylesheet(
  css: string,
  base: string,
  file: string,
  contents: Map<string, string>,
  imports: Map<string, ReturnType<StylesheetReader>>,
  design: Awaited<ReturnType<typeof staticDesignSystem>>,
) {
  const version = tailwindVersion()
  let serialized: string | undefined
  const read: StylesheetReader = (id, from) => {
    const captured = imports.get(JSON.stringify([from, id]))
    if (!captured) throw new Error(`Stylesheet was not captured: ${id} from ${from}`)
    return captured
  }
  const stylesheets = immutable(
    [...contents]
      .map(([file, content]) => ({ file, sha256: orderingHash(content) }))
      .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
  )
  const theme = immutable(themeFromDesign(design))
  return Object.freeze({
    theme,
    tailwindVersion: version,
    stylesheets,
    serialize: () =>
      (serialized ??= JSON.stringify({
        schema: 1,
        base,
        file: path.resolve(file),
        tailwindVersion: version,
        contents: [...contents],
        imports: [...imports].map(([key, value]) => [key, value.path]),
      })),
    async prepareOrder(candidates: readonly string[], signal?: AbortSignal) {
      signal?.throwIfAborted()
      const observed = [...candidates]
      const fresh = await staticDesignSystem(css, base, { file }, read)
      signal?.throwIfAborted()
      return describeTailwindOrder(fresh, observed, version, [...stylesheets])
    },
  })
}

function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child)
    Object.freeze(value)
  }
  return value
}

/**
 * `--radius-*` in pixels, each through its `var()` chain:
 * `--radius-control: var(--radius-lg)` is 8.
 */
/**
 * The three families Hozo compiles, `font-sans`, `font-serif` and
 * `font-mono`, as the project's theme has them.
 *
 * The Web spelling is asked of Tailwind, as a colour's is, so it is the same
 * `var(--font-mono)` Tailwind's own utility writes when the variable is
 * delivered, and the value itself for an `inline` theme. Before this they
 * were Tailwind's default stacks whatever `@theme` said (#1691).
 */
function readFontFamilies(
  design: Awaited<ReturnType<typeof __unstable__loadDesignSystem>>,
  declared: ReadonlyMap<string, string>,
): NonNullable<Theme['fontFamilies']> {
  return ['sans', 'serif', 'mono'].flatMap((name) => {
    const declaration = declared.get(`--font-${name}`)
    const web = design.theme.resolve(name, ['--font'])
    return declaration === undefined || web === null
      ? []
      : // Tailwind writes its default stacks across lines, which in CSS
        // is only whitespace.
        [{ name, web, value: dereference(declaration, declared).replace(/\s+/g, ' ') }]
  })
}

/**
 * `--shadow-*` as the box-shadow value each `var()` chain reaches:
 * `--shadow-surface: var(--shadow-sm)` is Tailwind's small shadow. Only a
 * project's own names matter -- Hozo has Tailwind's scale built in -- but the
 * scale is read too, so a project that redefines `--shadow-sm` is honoured.
 */
function readShadows(declared: ReadonlyMap<string, string>): { name: string; value: string }[] {
  const shadows: { name: string; value: string }[] = []
  for (const [name, declaration] of declared) {
    if (!name.startsWith('--shadow-')) continue
    const value = dereference(declaration, declared).replace(/s+/g, ' ').trim()
    if (value && !value.includes('var('))
      shadows.push({ name: name.slice('--shadow-'.length), value })
  }
  return shadows
}

function readRadii(declared: ReadonlyMap<string, string>): ThemeRadius[] {
  const radii: ThemeRadius[] = []
  for (const [name, declaration] of declared) {
    if (!name.startsWith('--radius-')) continue
    const px = lengthPx(dereference(declaration, declared))
    if (px !== undefined) radii.push({ name: name.slice('--radius-'.length), px })
  }
  return radii
}

/** A `rem` or `px` length in pixels, or `undefined` for anything else. */
function lengthPx(value: string): number | undefined {
  const rem = /^(-?[\d.]+)rem$/.exec(value)
  if (rem) return parseFloat(rem[1]!) * ROOT_FONT_SIZE_PX
  const px = /^(-?[\d.]+)px$/.exec(value)
  if (px) return parseFloat(px[1]!)
  return undefined
}

/** Tailwind's own animations, which Hozo implements itself. */
const BUILT_IN_ANIMATIONS = new Set(['spin', 'ping', 'pulse', 'bounce'])

interface KeyframesNode {
  kind: string
  params?: string
  selector?: string
  property?: string
  value?: string
  nodes?: KeyframesNode[]
}

/**
 * `--animate-*` and the `@keyframes` each names, asked of Tailwind rather
 * than parsed here, for the reason the colours are.
 */
function readAnimations(
  design: { theme: { getKeyframes(): Iterable<unknown> } },
  declared: ReadonlyMap<string, string>,
): ThemeAnimation[] {
  const keyframes = new Map<string, KeyframesNode>()
  for (const rule of design.theme.getKeyframes() as Iterable<KeyframesNode>) {
    if (rule.params) keyframes.set(rule.params.trim(), rule)
  }
  const animations: ThemeAnimation[] = []
  for (const [token, value] of declared) {
    if (!token.startsWith('--animate-')) continue
    const name = token.slice('--animate-'.length)
    if (BUILT_IN_ANIMATIONS.has(name)) continue
    const shorthand = dereference(value, declared)
    // The keyframes are named somewhere in the shorthand, not necessarily
    // first and not necessarily after the animation: `--animate-shake:
    // wiggle .3s` runs `@keyframes wiggle`.
    const rule = shorthand
      .split(/\s+/)
      .map((part) => keyframes.get(part))
      .find((found) => found !== undefined)
    if (!rule) {
      animations.push({ name, shorthand })
      continue
    }
    const frames = (rule.nodes ?? [])
      .filter((node) => node.kind === 'rule' && node.selector)
      .map((node) => ({
        selector: node.selector as string,
        declarations: (node.nodes ?? [])
          .filter((child) => child.kind === 'declaration' && child.property)
          .map((child) => [child.property, String(child.value ?? '')] as [string, string]),
      }))
    const body = frames
      .map(
        (frame) =>
          `  ${frame.selector} {\n${frame.declarations.map(([property, value]) => `    ${property}: ${value};`).join('\n')}\n  }`,
      )
      .join('\n')
    animations.push({
      name,
      shorthand,
      keyframesCss: `@keyframes ${rule.params?.trim()} {\n${body}\n}\n`,
      frames,
    })
  }
  return animations
}

/** How many `var()` hops to follow before giving up, which also breaks cycles. */
const VAR_HOPS = 8

/** `var(--name)` or `var(--name, fallback)`, and nothing else. */
const VAR_REFERENCE = /^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,([\s\S]+))?\)$/

/**
 * Follows a token that is defined as another token.
 *
 * Tailwind's own documentation writes a theme this way -- a semantic name
 * pointing at a palette entry:
 *
 *   @theme {
 *     --color-brand: var(--color-indigo-600);
 *   }
 *
 * `design.theme.entries()` hands back what was written rather than what it
 * resolves to, so before this the declaration above reached `toHex` as the
 * string "var(--color-indigo-600)", failed to convert, and the colour was
 * dropped from the Theme entirely. Silently: a project whose tokens were all
 * written that way got a Theme with no colours in it and no diagnostic, and
 * the Native lowering -- which has no custom properties to fall back on --
 * had nothing to emit.
 *
 * So the reference is followed here, against the same theme it was declared
 * in. A chain is allowed, because one semantic name pointing at another is
 * the same idea one level on, and `VAR_HOPS` bounds it so a token that refers
 * to itself ends the walk rather than the process.
 *
 * `var(--x, fallback)` takes the fallback when `--x` is not a theme entry,
 * which is what CSS does with it. A reference to something outside the theme
 * and with no fallback is left as it was written: it is then a colour this
 * cannot resolve, and the sentence above about not guessing applies to it.
 */
function dereference(value: string, declared: ReadonlyMap<string, string>): string {
  let current = value.trim()
  for (let hop = 0; hop < VAR_HOPS; hop++) {
    const match = VAR_REFERENCE.exec(current)
    if (match === null) return current
    const [, name, fallback] = match
    const target = name === undefined ? undefined : declared.get(name)
    if (target !== undefined) {
      current = target.trim()
      continue
    }
    if (fallback === undefined) return current
    current = fallback.trim()
  }
  return current
}

/**
 * `oklch(...)` to `#rrggbb`, or `null` if it isn't a colour this can
 * convert.
 *
 * Through `culori` rather than by hand: the same library, and the same
 * conversion, that produced Hozo's built-in copy of the default palette,
 * so a project's tokens and the built-ins can't disagree about what a
 * given oklch means.
 */
export function toHex(value: string): string | null {
  try {
    const rgb = toRgb(value)
    return rgb ? formatHex(rgb) : null
  } catch {
    return null
  }
}

/**
 * The file an `@import` in a project's stylesheet names.
 *
 * `base` is the directory the importing stylesheet resolves against.
 *
 * Relative and absolute paths resolve against the importer, and a bare
 * specifier resolves as a package -- which it did not before, and which is
 * how a library ships tokens at all. `@import "@hozo/ui/theme.css"` used to
 * become `<project's parent>/@hozo/ui/theme.css` and throw `ENOENT`, so a
 * project could depend on a package whose whole content was an `@theme` block
 * and have no way to read it.
 *
 * `tailwindcss` keeps its own line because the package's entry is a
 * JavaScript module and the stylesheet beside it is what is wanted; going
 * through `exports` would resolve the module.
 *
 * Node's resolver rather than a guess at `node_modules/<id>`: a package says
 * which of its files are importable in its `exports`, and one that does not
 * publish its stylesheet should fail here rather than be reached around.
 */
export function stylesheetPath(id: string, base: string): string {
  if (id === 'tailwindcss') return path.join(tailwindPackageDir(), 'index.css')
  if (id.startsWith('.') || path.isAbsolute(id)) return path.resolve(base, id)
  // Resolved from a file *inside* `base`, which is what `createRequire`
  // expects; handed the directory itself it would look one level too high.
  const require = createRequire(path.join(base, 'noop.js'))
  return require.resolve(id)
}

export function tailwindPackageDir(): string {
  const require = createRequire(import.meta.url)
  return path.dirname(require.resolve('tailwindcss/package.json'))
}

/// The root font size CSS resolves `rem` against, and the one Tailwind's
/// own defaults assume.
const ROOT_FONT_SIZE_PX = 16

/**
 * `--spacing` in pixels, or `undefined` if the project leaves it alone.
 *
 * Undefined rather than the default: an absent value means "whatever Hozo
 * already does", which keeps a project that never touched the scale on
 * exactly the path it was on.
 */
function readSpacing(design: {
  theme: { entries(): Iterable<[string, { value: unknown }]> }
}): number | undefined {
  for (const [name, entry] of design.theme.entries()) {
    if (name !== '--spacing') continue
    const value = String(entry.value).trim()
    const rem = /^(-?[\d.]+)rem$/.exec(value)
    if (rem) return parseFloat(rem[1]!) * ROOT_FONT_SIZE_PX
    const px = /^(-?[\d.]+)px$/.exec(value)
    if (px) return parseFloat(px[1]!)
    // Anything else -- a `calc()`, a custom property chain -- is left to
    // the default rather than guessed at. Guessing here would scale every
    // spacing utility in the project by a number nobody chose.
    return undefined
  }
  return undefined
}
