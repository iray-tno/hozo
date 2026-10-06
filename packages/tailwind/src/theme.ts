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

export interface ThemeColor {
  token: string
  /** As Tailwind writes it, which is what the Web backend emits verbatim. */
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
}

const toRgb = converter('rgb')

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

function designSystemFor(css: string, base: string) {
  const key = `${base}\u0000${css}`
  let pending = designSystems.get(key)
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
    designSystems.set(key, pending)
  }
  return pending
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
): Promise<string[]> {
  const design = await designSystemFor(css, base)
  const order = new Map(design.getClassOrder([...candidates]))
  // `bigint`, which is Tailwind's own key and wider than a `number` can
  // hold: the variant chain is packed into the high bits. Subtracting them
  // would be a `bigint` where `sort` wants a `number`, and narrowing one
  // would collapse exactly the bits that carry the variant.
  const rank = (name: string) => order.get(name) ?? null
  return [...candidates].sort((a, b) => {
    const left = rank(a)
    const right = rank(b)
    if (left === null) return right === null ? 0 : 1
    if (right === null) return -1
    return left < right ? -1 : left > right ? 1 : 0
  })
}

/**
 * Loads the theme a stylesheet defines.
 *
 * `css` is the project's entry stylesheet -- the file with
 * `@import "tailwindcss"` and its `@theme` block. `base` is the directory
 * imports resolve against, which is the file's own directory in every
 * ordinary setup.
 */
export async function loadTheme(css: string, base: string): Promise<Theme> {
  const design = await designSystemFor(css, base)

  const declared = new Map<string, string>()
  for (const [name, value] of design.theme.entries()) {
    declared.set(name, String(value.value).trim())
  }

  const colors: ThemeColor[] = []
  for (const [name, declaration] of declared) {
    if (!name.startsWith('--color-')) continue
    // The dark half of a pair is not a colour of its own: it is read below,
    // through the token it belongs to, and listing it as well would offer
    // `bg-brand--dark` as a utility beside `bg-brand`.
    if (name.endsWith(DARK_SUFFIX)) continue
    const oklch = dereference(declaration, declared)
    const hex = toHex(oklch)
    // A colour that won't convert is left out rather than guessed at. The
    // backends already have a defined answer for a token they can't
    // resolve -- a CSS variable reference on Web, a marker on Native --
    // and that is better than a colour that is nearly right.
    if (hex === null) continue
    const paired = declared.get(`${name}${DARK_SUFFIX}`)
    const darkOklch = paired === undefined ? null : dereference(paired, declared)
    const darkHex = darkOklch === null ? null : toHex(darkOklch)
    colors.push({
      token: name.slice('--color-'.length),
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
  return { colors, spacingPx: readSpacing(design), animations: readAnimations(design, declared) }
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
