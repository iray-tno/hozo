// Source-backed test adapter for the actual shipped leaves. No replacement
// Context algorithm or native-inheritance simulation lives in this loader.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import type { ComponentType, Context, ElementType } from 'react'
import type { HozoInteractionContext } from '../../behaviors/src/pressable-interaction.ts'
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
  HozoInheritedPressable?: ComponentType
  HozoInheritedLabel?: ComponentType
  HozoChip?: ComponentType
  HozoPressable?: ComponentType
  HozoText?: ComponentType
  HozoInteractionContext?: typeof HozoInteractionContext
  HozoInheritedMetricsContext: Context<HozoInheritedTextMetrics>
  HozoInheritedPaintContext: Context<HozoInheritedTextPaint>
}

export function loadTextInheritanceRuntime(
  legacy: Context<number>,
  names: { Text: ElementType; View: ElementType } = { Text: 'NativeText', View: 'NativeView' },
  labels = false,
  chips = false,
) {
  const runtime = buildSync({
    stdin: {
      contents: `export {HozoInheritedText} from '@hozo/core/generated/inherited-text';
export {HozoInheritedRelativeText} from '@hozo/core/generated/inherited-relative-text';
export {HozoInheritedView} from '@hozo/core/generated/inherited-view';
export {HozoInheritedMetricsContext,HozoInheritedPaintContext} from '@hozo/engine/generated/text-inheritance-protocol';
${labels ? "export {HozoInheritedPressable} from '@hozo/core/generated/inherited-pressable';export {HozoPressable} from '@hozo/core/generated/pressable';export {HozoText} from './packages/primitives/src/pressable.native.tsx';export {HozoInteractionContext} from '@hozo/behaviors/pressable-interaction';" : ''}
${chips ? "export {HozoInheritedLabel} from '@hozo/core/generated/inherited-label';export {HozoChip} from '@hozo/core/generated/chip';export {hozoTextChildren} from './packages/behaviors/src/text-child.native.tsx';" : ''}`,
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
    external: [
      'react',
      'react/*',
      'react-native',
      '@hozo/engine/generated/text-size-context',
      ...(labels || chips ? ['@hozo/engine'] : []),
      ...(chips ? ['@hozo/behaviors', '@hozo/engine/project'] : []),
    ],
    alias: {
      '@hozo/core/generated/inherited-label': fileURLToPath(
        new URL('../../primitives/src/generated/inherited-label.ts', import.meta.url),
      ),
      '@hozo/core/generated/chip': fileURLToPath(
        new URL('../../patterns/src/generated/chip.native.ts', import.meta.url),
      ),
      '@hozo/core/generated/inherited-pressable': fileURLToPath(
        new URL('../../primitives/src/generated/inherited-pressable.ts', import.meta.url),
      ),
      '@hozo/core/generated/pressable': fileURLToPath(
        new URL('../../primitives/src/generated/pressable.native.ts', import.meta.url),
      ),
      '@hozo/behaviors/pressable-interaction': fileURLToPath(
        new URL('../../behaviors/src/pressable-interaction.ts', import.meta.url),
      ),
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
    ...(labels || chips ? require('./react-native-stub.js') : {}),
    Animated: require('./react-native-stub.js').Animated,
    ...names,
    StyleSheet: { create: (styles: object) => styles, flatten: flattenRuntimeStyle },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', runtime.outputFiles![0].text)(
    (name: string) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name)
      if (name === 'react-native') return native
      if (name === '@hozo/engine')
        return {
          ...require('../../engine/src/color-transition.ts'),
          ...require('../../engine/src/text-style.ts'),
        }
      if (name === '@hozo/engine/project') return require('../../engine/src/project.ts')
      if (name === '@hozo/behaviors')
        return {
          ...require('../../behaviors/src/i18n.ts'),
          get hozoTextChildren() {
            return (module.exports as { hozoTextChildren: unknown }).hozoTextChildren
          },
        }
      if (name === '@hozo/engine/generated/text-size-context')
        return { HozoTextSizeContext: legacy }
      throw new Error(`Unexpected shipped inheritance dependency: ${name}`)
    },
    module,
    module.exports,
  )
  return { ...(module.exports as Runtime), native, files }
}
