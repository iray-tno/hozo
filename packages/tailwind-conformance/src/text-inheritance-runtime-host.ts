// Source-backed test adapter for the actual shipped leaves. No replacement
// Context algorithm or native-inheritance simulation lives in this loader.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import type { ComponentType, Context } from 'react'
import type {
  HozoInheritedTextMetrics,
  HozoInheritedTextPaint,
} from '../../engine/src/text-inheritance.ts'

const require = createRequire(import.meta.url)
export const flattenRuntimeStyle = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flattenRuntimeStyle))
    : style && typeof style === 'object'
      ? { ...style }
      : {}

type Runtime = {
  HozoInheritedText: ComponentType
  HozoInheritedRelativeText: ComponentType
  HozoInheritedView: ComponentType
  HozoInheritedMetricsContext: Context<HozoInheritedTextMetrics>
  HozoInheritedPaintContext: Context<HozoInheritedTextPaint>
}

export function loadTextInheritanceRuntime(
  legacy: Context<number>,
  names = { Text: 'NativeText', View: 'NativeView' },
) {
  const runtime = buildSync({
    stdin: {
      contents: `export {HozoInheritedText} from '@hozo/core/generated/inherited-text';
export {HozoInheritedRelativeText} from '@hozo/core/generated/inherited-relative-text';
export {HozoInheritedView} from '@hozo/core/generated/inherited-view';
export {HozoInheritedMetricsContext,HozoInheritedPaintContext} from '@hozo/engine/generated/text-inheritance-protocol';`,
      resolveDir: fileURLToPath(new URL('../../../', import.meta.url)),
      sourcefile: 'runtime-probe.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    metafile: true,
    external: ['react', 'react/*', 'react-native', '@hozo/engine/generated/text-size-context'],
    alias: {
      '@hozo/core/generated/inherited-relative-text': fileURLToPath(
        new URL('../../primitives/src/generated/inherited-relative-text.ts', import.meta.url),
      ),
      '@hozo/core/generated/inherited-text': fileURLToPath(
        new URL('../../primitives/src/generated/inherited-text.ts', import.meta.url),
      ),
      '@hozo/core/generated/inherited-view': fileURLToPath(
        new URL('../../primitives/src/generated/inherited-view.ts', import.meta.url),
      ),
      '@hozo/engine/generated/text-inheritance-protocol': fileURLToPath(
        new URL('../../engine/src/generated/text-inheritance-protocol.ts', import.meta.url),
      ),
    },
  })
  const files = Object.keys(runtime.metafile!.inputs).map((file) => file.replaceAll('\\', '/'))
  assert.ok(files.some((file) => file.endsWith('engine/src/text-inheritance.ts')))
  assert.ok(files.some((file) => file.endsWith('primitives/src/inherited-text.native.tsx')))
  assert.ok(files.some((file) => file.endsWith('primitives/src/inherited-view.native.tsx')))
  assert.ok(files.every((file) => !/text-inheritance-reference/.test(file)))
  const native = {
    ...names,
    StyleSheet: { create: (styles: object) => styles, flatten: flattenRuntimeStyle },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', runtime.outputFiles![0].text)(
    (name: string) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name)
      if (name === 'react-native') return native
      if (name === '@hozo/engine/generated/text-size-context')
        return { HozoTextSizeContext: legacy }
      throw new Error(`Unexpected shipped inheritance dependency: ${name}`)
    },
    module,
    module.exports,
  )
  return { ...(module.exports as Runtime), native, files }
}
