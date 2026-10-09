// What TalkBack says for elements a person reads but does not operate.
//
// The TalkBack harness moves with Tab, so it hears controls and nothing else:
// a heading, a meter, a count badge and a skeleton are never focused, and
// driving TalkBack's own linear navigation from outside was tried five ways
// and never answered (`android-talkback.sh`). So the app moves the focus
// itself, through the same `moveAccessibilityFocus` the Dialog uses, and
// TalkBack reads each element as it lands.
//
// Opened by `hozonativedemo://census`, which the harness sends with
// `am start` -- under TalkBack a tap is touch exploration, not a press. Each
// step logs `[hozo-census] <name>` before it moves, so the harness can lay
// TalkBack's utterances against the elements by time. Logged, not announced:
// an announcement would itself be what TalkBack says.

import {
  Badge,
  Heading,
  Meter,
  Paragraph,
  Progress,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  View,
} from '@hozo/core'
import { moveAccessibilityFocus } from '@hozo/native'
import { type ComponentRef, useEffect, useRef } from 'react'
import { AccessibilityInfo, findNodeHandle } from 'react-native'

type Target = ComponentRef<typeof View>

/** Long enough for TalkBack to finish reading one element before the next. */
const STEP_MS = 3000
/** For the screen's own announcement to finish before the first step. */
const SETTLE_MS = 4000

const NAMES = [
  'heading',
  'paragraph',
  'meter',
  'badge-count',
  'badge-word',
  'progress',
  'skeleton',
  // A table, which Android has no role or navigation for: a column header,
  // a data cell -- named with its column, "Price, $12" -- and a row header.
  'table-column-header',
  'table-cell',
  'table-row-header',
] as const

/** The table's cells, row by row, for checking that its columns line up. */
const GRID = [
  ['Item', 'Qty', 'Price'],
  ['Tea', '2', '$8'],
  ['Shortbread', '1', '$12'],
] as const

/**
 * Whether every cell in a column landed at the same x and width, on the
 * device's own layout engine. The column sizing is asserted in tests with
 * `onLayout` fired by hand; this is the one place a real Yoga answers.
 * Logged rather than announced, like the step markers.
 */
function reportTableLayout(cells: (Target | null)[][]) {
  const boxes: { x: number; width: number }[][] = cells.map(() => [])
  let pending = cells.flat().length
  cells.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell) {
        pending -= 1
        return
      }
      cell.measureInWindow((x, _y, width) => {
        ;(boxes[r] as { x: number; width: number }[])[c] = { x, width }
        pending -= 1
        if (pending > 0) return
        const columns = GRID[0].map((_, column) => boxes.map((line) => line[column]))
        const aligned = columns.every((column) =>
          column.every(
            (box) =>
              box !== undefined &&
              Math.abs(box.x - (column[0]?.x ?? 0)) <= 1 &&
              Math.abs(box.width - (column[0]?.width ?? 0)) <= 1,
          ),
        )
        const shape = boxes
          .map((line) =>
            line
              .map((box) => `${Math.round(box?.x ?? -1)}+${Math.round(box?.width ?? -1)}`)
              .join(' '),
          )
          .join(' | ')
        console.info(`[hozo-census-layout] table ${aligned ? 'aligned' : 'misaligned'} ${shape}`)
      })
    })
  })
}

function focus(target: Target | null) {
  if (!target) return
  if (moveAccessibilityFocus) {
    void moveAccessibilityFocus(target)
    return
  }
  const tag = findNodeHandle(target)
  if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
}

export default function CensusWalk() {
  const refs = useRef<Record<string, Target | null>>({})
  const bind = (name: (typeof NAMES)[number]) => (node: Target | null) => {
    refs.current[name] = node
  }
  const grid = useRef<(Target | null)[][]>(GRID.map((row) => row.map(() => null)))
  const cell =
    (row: number, column: number, name?: (typeof NAMES)[number]) => (node: Target | null) => {
      ;(grid.current[row] as (Target | null)[])[column] = node
      if (name) refs.current[name] = node
    }

  useEffect(() => {
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    // Measured by then: the table hides itself until its columns are sized.
    timers.push(
      setTimeout(() => {
        if (!cancelled) reportTableLayout(grid.current)
      }, SETTLE_MS),
    )
    NAMES.forEach((name, index) => {
      timers.push(
        setTimeout(
          () => {
            if (cancelled) return
            console.info(`[hozo-census] ${name}`)
            focus(refs.current[name] ?? null)
          },
          SETTLE_MS + index * STEP_MS,
        ),
      )
    })
    timers.push(
      setTimeout(
        () => {
          if (!cancelled) console.info('[hozo-census] done')
        },
        SETTLE_MS + NAMES.length * STEP_MS,
      ),
    )
    return () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])

  return (
    <View className="flex-1 gap-4 bg-white p-6 pt-16">
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Heading level={1} ref={bind('heading')} className="text-2xl font-bold">
        Census walk
      </Heading>
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Paragraph ref={bind('paragraph')}>Elements a person reads but does not operate.</Paragraph>
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Meter ref={bind('meter')} value={0.6} accessibilityLabel="Disk usage" />
      <Badge
        // @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it.
        ref={bind('badge-count')}
        count={3}
        accessibilityLabel="3 unread messages"
        className="self-start rounded-full bg-red-600 px-2 text-white"
      />
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Badge ref={bind('badge-word')} className="self-start rounded bg-slate-200 px-2">
        Draft
      </Badge>
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Progress ref={bind('progress')} value={40} max={100} accessibilityLabel="Upload" />
      {/* @ts-expect-error -- the compiler passes `ref` through to the host element; the props types do not list it. */}
      <Skeleton ref={bind('skeleton')} className="h-4 w-48 rounded bg-slate-200 animate-pulse" />
      <Table className="border border-slate-300">
        <TableHeader>
          <TableRow>
            {GRID[0].map((label, column) => (
              <TableHead
                key={label}
                ref={cell(0, column, column === 2 ? 'table-column-header' : undefined)}
                className="px-2"
              >
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {GRID.slice(1).map((line, index) => (
            <TableRow key={line[0]}>
              <TableHead
                scope="row"
                ref={cell(index + 1, 0, index === 1 ? 'table-row-header' : undefined)}
                className="px-2"
              >
                {line[0]}
              </TableHead>
              <TableCell ref={cell(index + 1, 1)} className="px-2 text-right">
                {line[1]}
              </TableCell>
              <TableCell
                ref={cell(index + 1, 2, index === 1 ? 'table-cell' : undefined)}
                className="px-2 text-right"
              >
                {line[2]}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </View>
  )
}
