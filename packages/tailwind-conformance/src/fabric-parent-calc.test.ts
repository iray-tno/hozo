// Decision 015 revisit-trigger and padding-box drift check.
//
// `docs/decisions/015-parent-calc-stays-within-the-component.md` decides not to
// emit a Fabric `ref.current?.parentElement?.clientWidth` fallback across
// component boundaries because `react-native@0.87.1` exposes only padding-box
// getters (`clientWidth` / `clientHeight`) with neither `getComputedStyle` nor
// `ResizeObserver`.
//
// This test checks both halves directly:
// 1. Against the installed `react-native` declaration tree, so a future React
//    Native release that ships `ResizeObserver` or `getComputedStyle` fails
//    loudly and triggers a re-evaluation of Decision 015.
// 2. Against `HozoMeasuredParent`, proving the exact 32px padding-box drift
//    that `parentElement.clientWidth` would introduce on a padded container
//    (`p-4`, width 300px) and that `HozoMeasuredParent` eliminates.

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'

import './native-render.ts'

const require = createRequire(import.meta.url)

function collectDtsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectDtsFiles(full))
    else if (entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

test('Decision 015 premises still hold in the installed react-native declarations', () => {
  const rnRoot = path.dirname(require.resolve('react-native/package.json'))
  const publicTypes = readFileSync(
    path.join(rnRoot, 'types', 'public', 'ReactNativeTypes.d.ts'),
    'utf8',
  )
  // Fabric ReadOnlyElement exposes parentElement + padding-box clientWidth/clientHeight.
  assert.match(publicTypes, /\bparentElement\s*\(\)\s*:\s*null\s*\|\s*ReadOnlyElement\b/)
  assert.match(publicTypes, /\bclientWidth\s*\(\)\s*:\s*number\b/)
  assert.match(publicTypes, /\bclientHeight\s*\(\)\s*:\s*number\b/)

  // Neither ResizeObserver nor getComputedStyle exists in react-native's public types yet.
  // If a React Native upgrade introduces either, revisit Decision 015.
  const allDts = collectDtsFiles(path.join(rnRoot, 'types'))
  const withResizeObserver = allDts.filter((file) =>
    /\bResizeObserver\b/.test(readFileSync(file, 'utf8')),
  )
  const withComputedStyle = allDts.filter((file) =>
    /\bgetComputedStyle\b/.test(readFileSync(file, 'utf8')),
  )
  assert.deepEqual(
    withResizeObserver,
    [],
    'react-native now declares ResizeObserver -- revisit docs/decisions/015-parent-calc-stays-within-the-component.md',
  )
  assert.deepEqual(
    withComputedStyle,
    [],
    'react-native now declares getComputedStyle -- revisit docs/decisions/015-parent-calc-stays-within-the-component.md',
  )
})

test('HozoMeasuredParent avoids the padding-box overflow that parentElement.clientWidth causes', () => {
  const react = require('react') as {
    createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  }
  const renderer = require('react-test-renderer') as {
    create: (element: unknown) => {
      root: {
        findAll: (
          p: (n: { props: Record<string, unknown> }) => boolean,
        ) => Array<{ props: Record<string, unknown> }>
      }
    }
    act: (cb: () => void) => void
  }
  const measuredBox = require('@hozo/primitives/generated/measured-box') as {
    HozoMeasuredParent: unknown
    HozoParentSizeQuery: unknown
  }

  let measuredContentWidth: number | undefined
  let measuredPaddingBoxWidth: number | undefined
  let root: ReturnType<typeof renderer.create> | undefined

  // A 300px border-box card with p-4 (16px horizontal padding each side, 0 border).
  // CSS content box = 268px; Fabric `parentElement.clientWidth` = 300px (padding box).
  renderer.act(() => {
    root = renderer.create(
      react.createElement(
        measuredBox.HozoMeasuredParent,
        { style: { paddingHorizontal: 16 } },
        react.createElement(
          measuredBox.HozoParentSizeQuery,
          null,
          (size: { width: number; paddingBoxWidth: number } | undefined) => {
            measuredContentWidth = size?.width
            measuredPaddingBoxWidth = size?.paddingBoxWidth
            return null
          },
        ),
      ),
    )
  })
  const targets = root!.root.findAll((node) => typeof node.props.onLayout === 'function')
  renderer.act(() => {
    for (const target of targets) {
      ;(target.props.onLayout as (e: unknown) => void)({
        nativeEvent: { layout: { width: 300, height: 100 } },
      })
    }
  })

  // For `w-[calc(100%-8px)]` inside a 300px card with p-4 (content box = 268px):
  // - Exact CSS result (HozoMeasuredParent): 268 - 8 = 260px (fits inside 268px content box)
  // - Fabric `parentElement.clientWidth` drift: 300 - 8 = 292px (overflows content box by 24px!)
  assert.equal(measuredContentWidth, 268)
  assert.equal(measuredPaddingBoxWidth, 300)
  assert.equal(measuredContentWidth! - 8, 260)
  assert.equal(measuredPaddingBoxWidth! - 8, 292)
  assert.ok(measuredPaddingBoxWidth! - 8 > measuredContentWidth!)
})
