// Evidence, not a production gap normalizer. Actual Yoga layout follows the
// styles emitted by both compiler paths; the browser owns the CSS reference.
import assert from 'node:assert/strict'
import { createCompiler, openCandidateCache, prepareTailwindContext } from '@hozo/compiler'
import Yoga from 'yoga-layout'
import { hozoDomStyle } from '../../engine/src/dom-style.ts'
import { prepareTailwindOrder, tailwindPackageDir } from '../../tailwind/src/theme.ts'
import {
  executeOrderModule,
  flattenOrderStyle,
  orderCandidateFactory,
} from './tailwind-order-baseline.ts'

export const gapAliasCases = [
  { id: 'generic-only', classes: 'gap-[16px]', inline: {}, native: [16, 16], web: [16, 16] },
  {
    id: 'inline-generic-after-row',
    classes: 'gap-y-[8px]',
    inline: { gap: 16 },
    native: [8, 16],
    web: [16, 16],
  },
  {
    id: 'inline-generic-after-column',
    classes: 'gap-x-[8px]',
    inline: { gap: 16 },
    native: [16, 8],
    web: [16, 16],
  },
  {
    id: 'inline-row-after-generic',
    classes: 'gap-[16px]',
    inline: { rowGap: 24 },
    native: [24, 16],
    web: [24, 16],
  },
  {
    id: 'inline-column-after-generic',
    classes: 'gap-[16px]',
    inline: { columnGap: 24 },
    native: [16, 24],
    web: [16, 24],
  },
  {
    id: 'inline-generic-after-generic',
    classes: 'gap-[16px]',
    inline: { gap: 24 },
    native: [24, 24],
    web: [24, 24],
  },
  {
    id: 'inline-generic-after-both-axes',
    classes: 'gap-[16px] gap-x-[8px] gap-y-[4px]',
    inline: { gap: 24 },
    native: [4, 8],
    web: [24, 24],
  },
  {
    id: 'inline-axes-after-both-axes',
    classes: 'gap-[16px] gap-x-[8px] gap-y-[4px]',
    inline: { rowGap: 24, columnGap: 24 },
    native: [24, 24],
    web: [24, 24],
  },
  {
    id: 'inline-object-axis-before-generic',
    classes: 'gap-[16px]',
    inline: { rowGap: 8, gap: 24 },
    native: [8, 24],
    web: [24, 24],
  },
  {
    id: 'inline-object-generic-before-axis',
    classes: 'gap-[16px]',
    inline: { gap: 24, rowGap: 8 },
    native: [8, 24],
    web: [8, 24],
  },
] as const

export const gapLayouts = ['row', 'row-reverse', 'column', 'column-reverse'].flatMap(
  (flexDirection) => ['ltr', 'rtl'].map((direction) => ({ flexDirection, direction })),
)

export function yogaGapGeometry(
  style: Record<string, unknown>,
  layout: (typeof gapLayouts)[number],
) {
  const root = Yoga.Node.create()
  try {
    root.setWidth(140)
    root.setHeight(140)
    root.setFlexDirection(
      {
        row: Yoga.FLEX_DIRECTION_ROW,
        'row-reverse': Yoga.FLEX_DIRECTION_ROW_REVERSE,
        column: Yoga.FLEX_DIRECTION_COLUMN,
        'column-reverse': Yoga.FLEX_DIRECTION_COLUMN_REVERSE,
      }[layout.flexDirection]!,
    )
    root.setFlexWrap(Yoga.WRAP_WRAP)
    root.setAlignItems(Yoga.ALIGN_FLEX_START)
    root.setAlignContent(Yoga.ALIGN_FLEX_START)
    for (const [key, value] of Object.entries(style)) {
      const gutter = {
        gap: Yoga.GUTTER_ALL,
        rowGap: Yoga.GUTTER_ROW,
        columnGap: Yoga.GUTTER_COLUMN,
      }[key]
      if (gutter === undefined) continue
      assert.equal(typeof value, 'number', 'this bounded probe assesses finite pixel gaps only')
      assert.ok(Number.isFinite(value))
      root.setGap(gutter, value as number)
    }
    for (let index = 0; index < 3; index++) {
      const child = Yoga.Node.create()
      child.setWidth(50)
      child.setHeight(50)
      child.setFlexShrink(0)
      root.insertChild(child, index)
    }
    root.calculateLayout(
      undefined,
      undefined,
      layout.direction === 'rtl' ? Yoga.DIRECTION_RTL : Yoga.DIRECTION_LTR,
    )
    const positions = [0, 1, 2].map((index) => {
      const child = root.getChild(index)
      return [child.getComputedLeft(), child.getComputedTop()]
    })
    return gapGeometry(positions, layout.flexDirection)
  } finally {
    root.freeRecursive()
  }
}

export function gapGeometry(positions: number[][], flexDirection: string) {
  const row = flexDirection.startsWith('row')
  return [
    Math.abs(positions[row ? 2 : 1][1] - positions[0][1]) - 50,
    Math.abs(positions[row ? 1 : 2][0] - positions[0][0]) - 50,
  ]
}

export async function prepareGapAliasSubjects() {
  const compiler = createCompiler()
  const names = [...new Set(gapAliasCases.flatMap((entry) => entry.classes.split(' ')))]
  const css = '@tailwind utilities;'
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('GapAlias.tsx', JSON.stringify(names.join(' ')), 0)
  const resolve = orderCandidateFactory(cache.renderNativeModulePlan(context).code)()
  return gapAliasCases.flatMap((entry) =>
    [entry.classes, entry.classes.split(' ').reverse().join(' ')].map((classes) => {
      const input = `import {View} from '@hozo/core';const el=<View className="${classes}" style={inline}/>`
      const native = compiler.prepareNativeModule(input).emit(context).components[0]
      const dynamic = compiler
        .prepareNativeModule(input.replace(`className="${classes}"`, 'className={runtimeNames}'))
        .emit(context).components[0]
      assert.deepEqual(native.diagnostics, [])
      assert.ok(
        dynamic.diagnostics.every((finding) => finding.code === 'DYNAMIC_CLASS_NAME_NOT_RESOLVED'),
      )
      const execute = (output) =>
        flattenOrderStyle(
          (
            executeOrderModule(`const hozoStyles=${output.styles};module.exports=(${output.jsx})`, {
              View: 'owner',
              inline: entry.inline,
              runtimeNames: classes,
              hozoClasses: resolve,
              h: (_type, props) => props,
            }) as { style: unknown }
          ).style,
        )
      const web = compiler.prepareWebModule(input).emit(context)[0]
      assert.deepEqual(web.diagnostics, [])
      const webProps = executeOrderModule(`module.exports=(${web.jsx})`, {
        inline: entry.inline,
        hozoDomStyle,
        h: (_type, props) => props,
      }) as { className: string; style: unknown }
      return {
        ...entry,
        classes,
        selected: execute(native),
        dynamic: execute(dynamic),
        css: web.css,
        webProps,
      }
    }),
  )
}
