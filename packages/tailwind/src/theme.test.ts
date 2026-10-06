import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { compile, compileNative, createCompiler } from '@hozo/compiler'
import { loadTheme, stylesheetPath, toHex } from './theme.ts'

/** Writes a stylesheet somewhere Tailwind can resolve imports from. */
async function themeFrom(css: string) {
  const dir = mkdtempSync(path.join(import.meta.dirname, '.theme-test-'))
  try {
    writeFileSync(path.join(dir, 'app.css'), css)
    return await loadTheme(css, dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('a project token is read alongside the default palette', async () => {
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --color-brand: oklch(62% 0.19 259); }`)

  const brand = theme.colors.find((c) => c.token === 'brand')
  assert.equal(brand?.oklch, 'oklch(62% 0.19 259)')
  assert.equal(brand?.hex, '#3581f6')
  // The defaults are still there: a `@theme` block adds to the palette
  // rather than replacing it, and reading only the custom ones would make
  // `bg-red-500` stop resolving the moment a project defined anything.
  assert.ok(theme.colors.some((c) => c.token === 'red-500'))
})

test('a token the project redefines wins over the built-in copy', async () => {
  // Tailwind lets a `@theme` redefine `--color-blue-500`. A compiler that
  // preferred its own bundled palette would render a colour the project
  // had explicitly changed.
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --color-blue-500: oklch(50% 0.2 200); }`)
  const blue = theme.colors.find((c) => c.token === 'blue-500')
  assert.equal(blue?.oklch, 'oklch(50% 0.2 200)')

  const source =
    `import { View } from '@hozo/core'\n` +
    `export function C() { return <View className="bg-blue-500" /> }\n`
  const css = createCompiler(theme).compile(source)[0].css
  assert.match(css, /background-color: oklch\(50% 0\.2 200\)/)
})

test('a custom colour reaches both backends in the spelling each needs', async () => {
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --color-brand: oklch(62% 0.19 259); }`)
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function C() { return <View className="bg-brand" /> }\n`

  // Web keeps the oklch Tailwind itself would emit; React Native has no
  // `oklch()`, so it takes the hex.
  const css = createCompiler(theme).compile(source)[0].css
  assert.match(css, /background-color: oklch\(62% 0\.19 259\)/)
  assert.match(createCompiler(theme).compileNative(source)[0].styles, /backgroundColor: '#3581f6'/)
})

test('without a theme the same source is unresolved, not wrong', async () => {
  // What every project got before this existed, and what a project still
  // gets for a token nothing defines. Both backends say "unresolved" in
  // their own way rather than inventing a colour.
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function C() { return <View className="bg-brand" /> }\n`
  assert.match(compile(source)[0].css, /background-color: var\(--hozo-color-brand\)/)
  assert.match(compileNative(source)[0].styles, /hozo-unresolved:brand/)
})

test('a colour that will not convert is left out rather than guessed', () => {
  assert.equal(toHex('oklch(62% 0.19 259)'), '#3581f6')
  assert.equal(toHex('not a colour'), null)
  // The backends have a defined answer for a token they can't resolve, and
  // that beats a colour that is nearly right.
  assert.equal(toHex(''), null)
})

test('a project spacing scale reaches every spacing utility', async () => {
  // The failure this fixes was silent, unlike the colour one: a project
  // setting `--spacing` got the right number of steps at the wrong size,
  // and the output was an ordinary padding.
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --spacing: 0.2rem; }`)
  assert.equal(theme.spacingPx, 3.2)

  const source =
    `import { View } from '@hozo/core'\n` +
    `export function C() { return <View className="p-4 -mt-2 gap-3 border-2" /> }\n`
  const css = createCompiler(theme).compile(source)[0].css

  assert.match(css, /padding-top: 12\.8px/)
  // Negation happens in steps, so the sign survives the scale.
  assert.match(css, /margin-top: -6\.4px/)
  // Resolved, not left as arithmetic -- and rounded, since the product is
  // written into the stylesheet as a literal.
  assert.match(css, /gap: 9\.6px/)
  // A border width is absolute whatever the spacing scale is, which is why
  // the two are different kinds of length rather than one number.
  assert.match(css, /border-top-width: 2px/)
})

test('a spacing scale Hozo cannot read leaves the default alone', async () => {
  // Guessing here would rescale every padding, margin and gap in the
  // project by a number nobody chose.
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --spacing: calc(1rem / 3); }`)
  assert.equal(theme.spacingPx, undefined)
})

test('p-px stays one physical pixel', async () => {
  // Tailwind means a hairline by it, not a step of anything.
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --spacing: 0.2rem; }`)
  const source =
    `import { View } from '@hozo/core'\n` +
    `export function C() { return <View className="p-px" /> }\n`
  const css = createCompiler(theme).compile(source)[0].css
  assert.match(css, /padding-top: 1px/)
})

test('a token defined as another token resolves to what that one is', async () => {
  // The way Tailwind's own documentation writes a semantic theme, and the
  // way a design system wants to: a name that says what a colour is for,
  // pointing at the palette entry it happens to be.
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --color-brand: var(--color-indigo-600); }`)

  const brand = theme.colors.find((c) => c.token === 'brand')
  const indigo = theme.colors.find((c) => c.token === 'indigo-600')
  assert.ok(indigo, 'the palette entry it points at')
  assert.equal(brand?.hex, indigo?.hex, 'the same colour, not a missing one')
  assert.equal(brand?.oklch, indigo?.oklch)
})

test('a chain of references is followed to the end of it', async () => {
  // One semantic name pointing at another is the same idea a level on: a
  // component says `bg-button-fill`, the theme says that is the accent, and
  // the accent is a palette entry.
  const theme = await themeFrom(`@import "tailwindcss";
    @theme {
      --color-accent: var(--color-indigo-600);
      --color-button-fill: var(--color-accent);
    }`)

  const fill = theme.colors.find((c) => c.token === 'button-fill')
  const indigo = theme.colors.find((c) => c.token === 'indigo-600')
  assert.equal(fill?.hex, indigo?.hex)
})

test('a reference that goes nowhere takes its fallback, as CSS would', async () => {
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --color-brand: var(--color-not-a-token, oklch(62% 0.19 259)); }`)

  assert.equal(theme.colors.find((c) => c.token === 'brand')?.hex, '#3581f6')
})

test('a reference with nowhere to go and no fallback is left out, not guessed', async () => {
  // The rule the rest of this function follows: a colour that cannot be
  // resolved is absent rather than approximated, because the backends each
  // have a defined answer for an absent token and none for a wrong one.
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --color-brand: var(--defined-somewhere-else); }`)

  assert.equal(
    theme.colors.find((c) => c.token === 'brand'),
    undefined,
  )
})

test('a token that refers to itself ends the walk rather than the process', async () => {
  const theme = await themeFrom(`@import "tailwindcss";
    @theme {
      --color-ouroboros: var(--color-worm);
      --color-worm: var(--color-ouroboros);
    }`)

  assert.equal(
    theme.colors.find((c) => c.token === 'ouroboros'),
    undefined,
  )
})

/** A package installed under `dir`, with the tokens a library would ship. */
function installed(dir: string, name: string, css: string): void {
  const home = path.join(dir, 'node_modules', ...name.split('/'))
  mkdirSync(path.join(home, 'src'), { recursive: true })
  writeFileSync(
    path.join(home, 'package.json'),
    JSON.stringify({ name, version: '0.0.0', exports: { './theme.css': './src/theme.css' } }),
  )
  writeFileSync(path.join(home, 'src', 'theme.css'), css)
}

test('a project can import the tokens a package ships', async () => {
  // #649 one layer up: a library whose whole content is an `@theme` block was
  // unreadable, because every `@import` but `tailwindcss` was treated as a
  // path. `@import "@acme/ui/theme.css"` became `<parent>/@acme/ui/theme.css`
  // and threw.
  const dir = mkdtempSync(path.join(import.meta.dirname, '.theme-test-'))
  try {
    installed(dir, '@acme/ui', '@theme { --color-brand: var(--color-indigo-600); }')
    writeFileSync(path.join(dir, 'app.css'), '')
    const theme = await loadTheme('@import "tailwindcss";\n@import "@acme/ui/theme.css";\n', dir)
    const brand = theme.colors.find((c) => c.token === 'brand')
    const indigo = theme.colors.find((c) => c.token === 'indigo-600')
    assert.ok(indigo)
    assert.equal(brand?.hex, indigo?.hex, 'the package’s token, resolved')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a relative import resolves against the stylesheet, not its parent', () => {
  // The bug the line above uncovered. Tailwind hands `loadStylesheet` the
  // *base directory* rather than a file, so taking its `dirname` climbed one
  // level for every import -- which nothing noticed, because until now no
  // project imported anything but `tailwindcss`, and that is answered without
  // looking at the base at all.
  assert.equal(stylesheetPath('./tokens.css', '/a/b'), path.resolve('/a/b/tokens.css'))
  assert.equal(stylesheetPath('../tokens.css', '/a/b'), path.resolve('/a/tokens.css'))
})

test('tailwindcss keeps its own line, because its entry is not the stylesheet', () => {
  // Through `exports` it would resolve the JavaScript module beside the CSS.
  assert.match(stylesheetPath('tailwindcss', '/anywhere'), /index\.css$/)
})

test('a token paired by name carries its dark value', async () => {
  // The authoring form, and it is a naming convention because Tailwind's
  // design system reports one value per key: a `@theme` wrapped in
  // `@media (prefers-color-scheme: dark)` comes back holding only the dark
  // value, with the light one gone before this can see it. Two keys survive
  // because they are two keys.
  const theme = await themeFrom(`@import "tailwindcss";
    @theme {
      --color-surface: var(--color-white);
      --color-surface--dark: var(--color-slate-900);
    }`)

  const surface = theme.colors.find((c) => c.token === 'surface')
  const slate = theme.colors.find((c) => c.token === 'slate-900')
  assert.equal(surface?.hex, '#ffffff')
  assert.equal(surface?.dark?.hex, slate?.hex, 'the dark half, resolved like any other token')
})

test('the dark half is not offered as a colour of its own', async () => {
  // Listing it would put `bg-surface--dark` beside `bg-surface` in the
  // utilities, which is a second way to say the thing the pairing exists to
  // say once.
  const theme = await themeFrom(`@import "tailwindcss";
    @theme {
      --color-surface: var(--color-white);
      --color-surface--dark: var(--color-slate-900);
    }`)

  assert.equal(
    theme.colors.find((c) => c.token === 'surface--dark'),
    undefined,
  )
})

test('an unpaired token has no dark half, which is most of them', async () => {
  const theme = await themeFrom(`@import "tailwindcss";
    @theme { --color-brand: oklch(62% 0.19 259); }`)

  assert.equal(theme.colors.find((c) => c.token === 'brand')?.dark, undefined)
  assert.equal(theme.colors.find((c) => c.token === 'red-500')?.dark, undefined)
})

test("a project's own animation reaches both backends (decision 007, slice 3)", async () => {
  const theme = await themeFrom(`@import "tailwindcss";
@theme {
  --animate-wiggle: wiggle 1s ease-in-out infinite;
  @keyframes wiggle {
    0%, 100% { transform: rotate(-3deg); }
    50% { transform: rotate(3deg); opacity: 0.5; }
  }
}`)
  const wiggle = theme.animations?.find((animation) => animation.name === 'wiggle')
  assert.ok(wiggle, JSON.stringify(theme.animations))
  assert.equal(wiggle.shorthand, 'wiggle 1s ease-in-out infinite')
  assert.match(wiggle.keyframesCss ?? '', /@keyframes wiggle \{/)
  // Tailwind's four are Hozo's own, on the native driver; they are not read
  // from the theme.
  assert.ok(!theme.animations?.some((animation) => animation.name === 'spin'))

  const compiler = createCompiler(theme)
  const source = `import { View } from '@hozo/core'\nexport const C = () => <View className="animate-wiggle" />\n`
  const web = compiler.compile(source)[0]
  assert.ok(web)
  assert.match(web.css, /animation: wiggle 1s ease-in-out infinite;/)
  assert.match(web.css, /@keyframes wiggle/)
  const native = compiler.compileNative(source)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0, JSON.stringify(native.diagnostics))
  assert.ok(
    native.prelude.some((line) => line.includes("rotate: '3deg'")),
    native.prelude.join('\n'),
  )

  // Without the theme the same class is carried on the Web and named on
  // Native, rather than gone.
  assert.doesNotMatch(compile(source)[0]?.css ?? '', /animation/)
  assert.ok(
    compileNative(source)[0]?.diagnostics.some(({ message }) => message.includes('animate-wiggle')),
  )
})

test('a frame declaration Native cannot read is named, not dropped in silence', async () => {
  // Tailwind's own `bounce` is written this way: a timing function per frame.
  const theme = await themeFrom(`@import "tailwindcss";
@theme {
  --animate-hop: hop 1s infinite;
  @keyframes hop {
    0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8, 0, 1, 1); }
    50% { transform: none; animation-timing-function: cubic-bezier(0, 0, 0.2, 1); }
  }
}`)
  const source = `import { View } from '@hozo/core'\nexport const C = () => <View className="animate-hop" />\n`
  const native = createCompiler(theme).compileNative(source)[0]
  assert.ok(native)
  assert.ok(
    native.diagnostics.some(({ message }) => message.includes('`animation-timing-function`')),
    JSON.stringify(native.diagnostics),
  )
  assert.ok(native.prelude.some((line) => line.includes('useHozoKeyframes(')))
})
