// One spelling for a notch, on both platforms.
//
// A safe-area inset is a value both platforms have and neither shares a
// spelling for. The browser resolves `env(safe-area-inset-top)` in the
// cascade; React Native has no cascade, and no way to read the number from
// its own core either -- `SafeAreaView` is deprecated, iOS-only, and applies
// padding rather than reporting a value, and `StatusBar.currentHeight` is
// Android-only and is the status bar rather than the cutout.
//
// So this is the shape of problem Hozo exists for, and the interesting part
// of the answer is what it did *not* do:
//
//   - no new class name. `pt-[env(safe-area-inset-top)]` is a class
//     Tailwind's own engine produces, so the Web side is Tailwind's output
//     verbatim and the conformance denominator still recognises it. A
//     `pt-safe` would have been a spelling only Hozo knows;
//   - no native module. Hozo wraps `react-native-safe-area-context` rather
//     than shipping the Objective-C and Kotlin itself, which keeps every
//     `@hozo/*` package installable without a rebuild.
//
// What is left for the compiler is the translation: on Native the value
// becomes an inline style read from a hook, exactly as `h-screen` does.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import { compile, compileNative } from '@hozo/compiler'

const require = createRequire(import.meta.url)

const CLASSES = 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] px-4'

function source(classes: string) {
  return `import { View } from '@hozo/core'\nexport function Screen() { return <View className="${classes}" /> }`
}

test('the Web half is the browser’s, and Hozo adds nothing to it', () => {
  // `env()` is a CSS function the browser resolves. There is no runtime,
  // no hook and no Hozo-specific class -- the stylesheet is what Tailwind
  // would have written.
  const { css } = compile(source(CLASSES), 'Screen.tsx')[0] as { css: string }
  assert.match(css, /padding-top:\s*env\(safe-area-inset-top\)/)
  assert.match(css, /padding-bottom:\s*env\(safe-area-inset-bottom\)/)
})

test('the Native half reads the same value from a hook', () => {
  const compiled = compileNative(source(CLASSES), 'Screen.tsx')[0] as {
    jsx: string
    styles: string
    prelude: string[]
    runtimeImports: string[]
    diagnostics: { code: string }[]
  }

  assert.deepEqual(compiled.diagnostics, [])
  assert.deepEqual(compiled.prelude, ['const __hozoSafeArea = useHozoSafeArea()'])
  assert.deepEqual(compiled.runtimeImports, ['useHozoSafeArea'])
  assert.match(compiled.jsx, /paddingTop: __hozoSafeArea\.top/)
  assert.match(compiled.jsx, /paddingBottom: __hozoSafeArea\.bottom/)
})

test('and the padding the build can resolve stays in the StyleSheet', () => {
  // The split is the point: only the number that changes with the device
  // costs anything per render. A rotation moves the notch, and nothing
  // else on the element has to be rebuilt for that.
  const { styles } = compileNative(source(CLASSES), 'Screen.tsx')[0] as { styles: string }
  assert.match(styles, /paddingStart: 16,/)
  assert.doesNotMatch(styles, /paddingTop/)
})

test('an env() React Native cannot answer is still refused', () => {
  // The rule is not "any `env()`". A keyboard inset has no React Native
  // equivalent, and lowering it to a zero would be the silent wrong answer
  // the refusal exists to prevent -- a padding of zero looks like a
  // padding somebody wrote.
  const compiled = compileNative(source('pt-[env(keyboard-inset-height)]'), 'Screen.tsx')[0] as {
    diagnostics: { code: string; message: string }[]
    prelude: string[]
  }
  assert.equal(compiled.diagnostics.length, 1)
  assert.equal(compiled.diagnostics[0]?.code, 'WEB_ONLY_PROPERTY_ON_NATIVE')
  assert.deepEqual(compiled.prelude, [])
})

test('and neither is a property where the inset means nothing', () => {
  // `width: env(safe-area-inset-left)` parses on Web and is meaningless on
  // a phone, so the accepted properties are padding, margin and the four
  // insets rather than every length.
  const compiled = compileNative(source('w-[env(safe-area-inset-left)]'), 'Screen.tsx')[0] as {
    diagnostics: { code: string }[]
    prelude: string[]
  }
  assert.ok(compiled.diagnostics.length > 0, 'a meaningless inset was accepted')
  assert.deepEqual(compiled.prelude, [])
})

test('the runtime hook the compiler names is one the runtime exports', () => {
  // The join both halves of this feature depend on. A compiler that emits
  // `useHozoSafeArea` and a runtime that exports something else is a
  // ReferenceError on a device and nothing at build time -- which is
  // exactly how `Del` reached a phone and threw (#296).
  const { runtimeImports } = compileNative(source(CLASSES), 'Screen.tsx')[0] as {
    runtimeImports: string[]
  }
  const runtime = require('../../runtime/src/safe-area.native.ts') as Record<string, unknown>
  for (const name of runtimeImports) {
    assert.equal(typeof runtime[name], 'function', `@hozo/runtime does not export ${name}`)
  }
})
