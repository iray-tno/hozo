// Treemap layout: nested rows, each a rectangle whose area is its share of
// the whole, its children laid out inside it. Rectangles are squarified
// (Bruls, Huizing and van Wijk) so that none is a sliver too thin to read.
// It returns the same `ChartModel` as the other charts, one datum per
// node in depth-first order, with two series, the value and its share of
// its group, so the table, the tooltip and the sentence read it as they
// read a funnel. What only a treemap has, its levels and rectangles, is in
// `tree`.

import { nextDatum } from './active.ts'
import { percent } from './funnel.ts'
import {
  type ChartModel,
  type ChartSeries,
  type ChartXAxis,
  defaultFormat,
  estimateTextWidth,
  type LegendKey,
  type Mark,
  rowValue,
  seriesLegend,
} from './model.ts'

export interface TreemapValue {
  /** The field of each leaf that holds its value; a group's is the sum of its children's. */
  key: string
  /** What the value is, read with each rectangle: "Budget: $1,200". */
  label: string
  format?: (value: number) => string
}

export interface TreemapChartInput {
  /** The top level; each row may hold its children under `childrenKey`. */
  data: readonly Record<string, unknown>[]
  /** The field that names each row, at every level. */
  x: ChartXAxis
  value: TreemapValue
  /** The field holding a row's children; `'children'` by default. */
  childrenKey?: string
  /** What the whole is called, as the top level's group; `'All'` by default. */
  rootLabel?: string
  width: number
  height: number
  fontSize?: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface TreeLabel {
  datum: number
  x: number
  y: number
  text: string
  /** Black or white, whichever reads better on the rectangle's colour. */
  fill: '#000000' | '#ffffff'
}

export interface Tree {
  /** Each node's parent, or -1 for the top level. */
  parent: number[]
  depth: number[]
  children: number[][]
  /** The top level, in data order. */
  top: number[]
  /** Each node named with its groups, "Hardware, Phones", as it is read. */
  path: string[]
  /** Each node's rectangle; absent for one with nothing to draw. */
  rects: (Rect | undefined)[]
  /** Each node's palette index: its top-level group's position. */
  tone: number[]
  /** Leaf names inside their rectangles, where they fit. */
  labels: TreeLabel[]
  /** The top-level groups above the plot, `series` being the tone. */
  legend: LegendKey[]
  rootLabel: string
}

export type TreemapModel = ChartModel & { tree: Tree }

/** The second series' label, read in the table and with each rectangle. */
export const SHARE_LABEL = 'Share of its group'

/** The value series and the share series, each with its own format. */
export function treemapSeries(value: TreemapValue): ChartSeries[] {
  return [
    { key: value.key, label: value.label, format: value.format },
    { key: `${value.key}:share`, label: SHARE_LABEL, format: percent },
  ]
}

/** Between sibling rectangles, so neighbours of one colour stay two shapes. */
const GAP = 2
/** Between top-level groups, wider, so a group reads as one. */
const GROUP_GAP = 4

const round = (value: number) => Math.round(value * 100) / 100

/** The squarified ratio of the worst rectangle in a row of `areas` along `side`. */
function worst(areas: readonly number[], side: number): number {
  let sum = 0
  let max = 0
  let min = Number.POSITIVE_INFINITY
  for (const area of areas) {
    sum += area
    max = Math.max(max, area)
    min = Math.min(min, area)
  }
  const s2 = sum * sum
  const w2 = side * side
  return Math.max((w2 * max) / s2, s2 / (w2 * min))
}

/**
 * Rectangles for `values` inside `rect`, each with the area of its share.
 * Laid out largest first, a row at a time along the shorter side, adding to
 * a row while that makes its worst rectangle squarer. Returns rectangles in
 * the order of `values`; a value of zero or less gets none.
 */
export function squarify(values: readonly number[], rect: Rect): (Rect | undefined)[] {
  const out: (Rect | undefined)[] = values.map(() => undefined)
  const total = values.reduce((sum, value) => sum + (value > 0 ? value : 0), 0)
  if (total <= 0 || rect.width <= 0 || rect.height <= 0) return out
  const scale = (rect.width * rect.height) / total
  const order = values
    .map((value, index) => ({ index, area: value * scale }))
    .filter((item) => item.area > 0)
    .sort((a, b) => b.area - a.area || a.index - b.index)
  const rest = { ...rect }
  let row: typeof order = []
  const place = () => {
    const sum = row.reduce((total, item) => total + item.area, 0)
    if (rest.width >= rest.height) {
      // A column down the left of what is left.
      const thickness = rest.height > 0 ? sum / rest.height : 0
      let y = rest.y
      for (const item of row) {
        const height = thickness > 0 ? item.area / thickness : 0
        out[item.index] = { x: rest.x, y, width: thickness, height }
        y += height
      }
      rest.x += thickness
      rest.width -= thickness
    } else {
      // A row across the top of what is left.
      const thickness = rest.width > 0 ? sum / rest.width : 0
      let x = rest.x
      for (const item of row) {
        const width = thickness > 0 ? item.area / thickness : 0
        out[item.index] = { x, y: rest.y, width, height: thickness }
        x += width
      }
      rest.y += thickness
      rest.height -= thickness
    }
    row = []
  }
  for (const item of order) {
    const side = Math.min(rest.width, rest.height)
    const areas = row.map((entry) => entry.area)
    if (row.length === 0 || worst([...areas, item.area], side) <= worst(areas, side)) row.push(item)
    else {
      place()
      row.push(item)
    }
  }
  if (row.length > 0) place()
  return out
}

/** `rect` shrunk by `by` on every side, never below nothing. */
function inset(rect: Rect, by: number): Rect {
  const dx = Math.min(by, rect.width / 2)
  const dy = Math.min(by, rect.height / 2)
  return {
    x: rect.x + dx,
    y: rect.y + dy,
    width: rect.width - dx * 2,
    height: rect.height - dy * 2,
  }
}

/** Black or white text on `color`, whichever has more contrast; white for a colour it cannot read. */
export function labelInk(color: string): '#000000' | '#ffffff' {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1]
  if (!hex) return '#ffffff'
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Either of black and white has at least 4.58:1 against any colour.
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff'
}

/**
 * The keys a treemap answers. The arrows, Page Up and Down, Home and End
 * move among the active node's siblings, as on any chart's row of data;
 * Enter goes into its first child and Escape back out to its group.
 */
export function treeStep(tree: Tree, key: string, active: number | undefined): number | undefined {
  if (active === undefined || active < 0) {
    const first = nextDatum(key, undefined, tree.top.length, true)
    return first === undefined ? undefined : tree.top[first]
  }
  if (key === 'Enter') return tree.children[active]?.[0]
  if (key === 'Escape') {
    const parent = tree.parent[active] ?? -1
    return parent >= 0 ? parent : undefined
  }
  const parent = tree.parent[active] ?? -1
  const siblings = parent >= 0 ? (tree.children[parent] ?? []) : tree.top
  const at = siblings.indexOf(active)
  const next = nextDatum(key, at, siblings.length, true)
  return next === undefined ? undefined : siblings[next]
}

/**
 * The colours are by top-level group, so `palette` and `colors` give one
 * per group and every rectangle in it takes that one.
 */
export function treemapChartModel(
  input: TreemapChartInput,
  colorOf: (tone: number) => string = () => '#2563eb',
): TreemapModel {
  const fontSize = input.fontSize ?? 12
  const childrenKey = input.childrenKey ?? 'children'
  const rootLabel = input.rootLabel ?? 'All'
  const name = input.x.format ?? ((value: unknown) => String(value ?? ''))
  const format = input.value.format ?? defaultFormat

  // Depth first, each group before its children, so the table reads down
  // the tree and a row's group is always above it.
  const rows: Record<string, unknown>[] = []
  const parent: number[] = []
  const depth: number[] = []
  const children: number[][] = []
  const top: number[] = []
  const walk = (nodes: unknown, up: number, level: number) => {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (node === null || typeof node !== 'object') continue
      const index = rows.length
      rows.push(node as Record<string, unknown>)
      parent.push(up)
      depth.push(level)
      children.push([])
      if (up >= 0) children[up]?.push(index)
      else top.push(index)
      walk((node as Record<string, unknown>)[childrenKey], index, level + 1)
    }
  }
  walk(input.data, -1, 0)
  const count = rows.length
  const categories = rows.map((row) => name(row[input.x.key]))
  const path = categories.map((_, i) => {
    const names: string[] = []
    for (let at = i; at >= 0; at = parent[at] ?? -1) names.unshift(categories[at] ?? '')
    return names.join(', ')
  })

  // A leaf's value is its own; a group's the sum of its children's
  // positive values, which is the area they fill. A group with nothing
  // below it to add has no value, and reads as a gap.
  const values: (number | undefined)[] = new Array(count).fill(undefined)
  for (let i = count - 1; i >= 0; i--) {
    const below = children[i] ?? []
    if (below.length === 0) {
      values[i] = rowValue(rows[i] as Record<string, unknown>, input.value.key)
      continue
    }
    let sum = 0
    let any = false
    for (const child of below) {
      const value = values[child]
      if (value === undefined) continue
      any = true
      if (value > 0) sum += value
    }
    values[i] = any ? sum : undefined
  }
  const positive = (value: number | undefined) => (value !== undefined && value > 0 ? value : 0)
  const total = top.reduce((sum, i) => sum + positive(values[i]), 0)
  const shares = values.map((value, i) => {
    const up = parent[i] ?? -1
    const whole = up >= 0 ? positive(values[up]) : total
    return value === undefined || whole <= 0 ? undefined : value / whole
  })
  const tone = new Array<number>(count).fill(0)
  for (const [group, i] of top.entries()) {
    const stack = [i]
    while (stack.length) {
      const at = stack.pop() as number
      tone[at] = group
      stack.push(...(children[at] ?? []))
    }
  }

  // The groups' key above the plot, for two or more, so colour is never the
  // only thing saying which group a rectangle is in.
  const legendInput = {
    data: [],
    x: input.x,
    series: top.map((i) => ({ key: String(i), label: categories[i] ?? '' })),
    width: input.width,
    height: input.height,
    fontSize,
  }
  const key = seriesLegend(legendInput)
  // Each key's `series` is its group's place in the top level, which is its tone.
  const legend = key.keys
  const plot = {
    x: 0,
    y: key.height,
    width: input.width,
    height: Math.max(0, input.height - key.height),
  }

  const rects: (Rect | undefined)[] = new Array(count).fill(undefined)
  const layout = (nodes: readonly number[], within: Rect, gap: number) => {
    const placed = squarify(
      nodes.map((i) => positive(values[i])),
      within,
    )
    for (const [slot, i] of nodes.entries()) {
      const rect = placed[slot]
      if (!rect) continue
      const own = inset(rect, gap / 2)
      if (own.width <= 0 || own.height <= 0) continue
      rects[i] = own
      const below = children[i] ?? []
      if (below.length) layout(below, own, GAP)
    }
  }
  layout(top, plot, GROUP_GAP)

  const marks: Mark[] = []
  const labels: TreeLabel[] = []
  const pad = fontSize / 2
  for (let i = 0; i < count; i++) {
    const rect = rects[i]
    if (!rect || (children[i]?.length ?? 0) > 0) continue
    marks.push({
      kind: 'cell',
      series: 0,
      datum: i,
      tone: tone[i] as number,
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
    })
    // A name only where it fits whole: a clipped name says less than none,
    // and the tooltip, the sentence and the table still name it.
    const text = categories[i] ?? ''
    const fill = labelInk(colorOf(tone[i] as number))
    if (
      rect.width >= estimateTextWidth(text, fontSize) + pad * 2 &&
      rect.height >= fontSize + pad * 2
    ) {
      labels.push({
        datum: i,
        x: round(rect.x + pad),
        y: round(rect.y + pad + fontSize * 0.85),
        text,
        fill,
      })
      const value = values[i]
      const line = value === undefined ? '' : format(value)
      if (
        line &&
        rect.height >= fontSize * 2.4 + pad * 2 &&
        rect.width >= estimateTextWidth(line, fontSize) + pad * 2
      )
        labels.push({
          datum: i,
          x: round(rect.x + pad),
          y: round(rect.y + pad + fontSize * 2.25),
          text: line,
          fill,
        })
    }
  }

  // The tooltip sits beside a rectangle's middle, as it sits beside a bar.
  const centers = rects.map((rect) => (rect ? round(rect.x + rect.width / 2) : 0))
  const inside = (rect: Rect | undefined, x: number, y: number) =>
    rect !== undefined &&
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height

  return {
    width: input.width,
    height: input.height,
    plot,
    categories,
    values: [values, shares],
    marks,
    xTicks: [],
    yTicks: [],
    centers,
    // The leaf under the point: the smallest thing there, which a finger
    // means; Escape then reaches its groups.
    datumAt(x: number, y = 0) {
      let found = -1
      let nodes = top
      for (;;) {
        const hit = nodes.find((i) => inside(rects[i], x, y))
        if (hit === undefined) return found
        found = hit
        nodes = children[hit] ?? []
        if (nodes.length === 0) return found
      }
    },
    tree: { parent, depth, children, top, path, rects, tone, labels, legend, rootLabel },
    references: [],
  }
}
