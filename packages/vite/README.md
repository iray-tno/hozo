# @hozo/vite

Vite integration for Hozo's Web backend. Lowers `View`/`Text`/`Pressable`/`Button` into semantic DOM and a real stylesheet, rewriting each component in place.

## Setup

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { hozo } from '@hozo/vite'

export default defineConfig({
  plugins: [hozo({ css: 'src/theme.css' }), react()],
})
```

`hozo()` must come before `react()`. The plugin runs at `enforce: 'pre'` so it sees the file as written — the JSX the compiler was built to read, not `@vitejs/plugin-react`'s output.

## Options

Every Hozo integration takes the same options.

| Option | Meaning |
| --- | --- |
| `css` | The project's Tailwind entry stylesheet. Read once per build by running Tailwind's own resolver. |
| `root` | Project root. Defaults to Vite's. |
| `content` | Which files the project-wide scan walks. |
| `sources` | Modules whose primitives may be lowered. Defaults to `@hozo/core` and `react-native`. |
| `unloweredReactNativeJsx` | Policy when Web output still contains JSX backed directly by React Native after lowering: `'allow'` (default), `'warn'`, or `'error'`. |
| `debug` | Report what the scan found. |

`css` is the one worth setting. Left out, Hozo looks for the usual filenames and falls back to Tailwind's defaults if it finds none, reporting what it looked for. That fallback is right until the project defines its own tokens under a name Hozo did not guess — and then `bg-brand` compiles to a CSS variable nothing defines and `p-4` to the wrong number of pixels, neither of which is an error.

### Unlowered React Native JSX Policy

`unloweredReactNativeJsx` controls what happens when direct `react-native` JSX remains in Web output after Hozo lowering:

- `'allow'` (default): Leaves unlowered JSX in place to be resolved at bundle time by a compatibility layer (such as `react-native-web`). Adds zero overhead to the build.
- `'warn'`: Emits a build warning listing any unlowered elements (e.g. `SectionList`), allowing progressive migration.
- `'error'`: Fails the build if any direct React Native JSX survives lowering, naming the exact imported bindings that require fallback or lowering. Aliases and namespace JSX are tracked by the parser rather than guessed from source text.

## Two stylesheets

Each lowered module gets a `<file>.hozo.css` companion written next to it and imported normally, rather than served through a virtual module.

Alongside it, one project-wide stylesheet under `node_modules/.hozo/` covers the classes the compiler *couldn't* read — a `className` that only a runtime expression produces. Those come from a byte scan of every source file rather than from the AST, so this plugin owns the project walk and the file-deletion signal while the cache in Rust owns scanning, staleness and persistence.

## Dev mode

A style-only edit reaches the browser in two rounds: the `.tsx` change triggers the first, that transform writes the CSS, and the watcher seeing the new CSS triggers the second. It converges because identical bytes are never rewritten — without that, each transform would invalidate the stylesheet it had just written and the two would take turns forever.

The project-wide stylesheet lives under `node_modules`, which Vite's watcher ignores, so its invalidation is explicit rather than left to the watcher. Deleting a file drops its classes; creating one adds them, if the project's `content` globs would have included it.

## MDX

A Hozo primitive written inline in an `.mdx` file compiles, on Astro as well as anywhere else.

That takes a step, because MDX does not hand this plugin JSX. Told `jsx: true` it produces JSX and everything works; told nothing it folds the document to automatic-runtime calls first — `_jsx(View, { className: "p-4" })` — and Hozo reads JSX. `@astrojs/mdx` exposes no `jsx` option at all, so on Astro this was never a setting anybody forgot: the elements rendered, their class names passed through uncompiled, and only a project that also ran Tailwind over the same tree got rules for them. A Hozo-only project lost the styling with nothing reported at build or at run time.

So the calls are written back as JSX before the compiler reads them, and folded again at the end of the same transform — the step this plugin was already applying to its own output. They are folded back with the runtime they came from, which matters: Astro's MDX calls `astro/jsx-runtime`, and the same tree rebuilt by React's runtime renders as the string `[object Object]`.

A call with no JSX spelling — a computed prop name, a spread child — is left folded rather than approximated, and named in a build warning. A fold's own output always has one, so in practice this is only reachable from a hand-written `_jsx()` call in an `.mdx` file's ESM block.
