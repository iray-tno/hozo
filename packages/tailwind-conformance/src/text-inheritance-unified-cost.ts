// Decision 013's one JS cost comparison. Not a test: run it by hand, with
// React's production build so development-only checks do not dominate.
//
//   NODE_ENV=production node src/text-inheritance-unified-cost.ts
//
// Mock Native hosts, so this times React's work (component executions,
// context reads, reconciliation), not layout or drawing. The question it
// answers is whether the readers add enough JS per commit to matter.
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { loadTextInheritanceRuntime } from './text-inheritance-runtime-host.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
const h = React.createElement
if (process.env.NODE_ENV !== 'production') throw new Error('Run with NODE_ENV=production')

const rt = loadTextInheritanceRuntime(React.createContext(14))
const { HozoInheritedLeafText, HozoInheritedScope, HozoInheritedText, HozoInheritedView } = rt
const ROWS = Number(process.env.ROWS ?? 1000)
const LABELS = 50
const RUNS = 41
const TITLE = Object.freeze({ fontSize: 16, fontWeight: '600' })
const SUB = Object.freeze({ color: '#666666' })

type Variant = 'plain' | 'leaf' | 'scoped leaf' | 'runtime route'

// One list row as each route would emit it: a box, an outermost Text with
// its own size, and a nested Text the platform inherits into.
let rowRenders = 0
function Row({ variant, i }: { variant: Variant; i: number }) {
  rowRenders++
  const Box = variant === 'runtime route' ? HozoInheritedView : 'NativeView'
  const Outer =
    variant === 'plain'
      ? 'NativeText'
      : variant === 'runtime route'
        ? HozoInheritedText
        : HozoInheritedLeafText
  const Inner = variant === 'runtime route' ? HozoInheritedText : 'NativeText'
  return h(
    Box,
    { style: { padding: 8 } },
    h(Outer, { style: TITLE }, `Row ${i} `, h(Inner, { style: SUB }, 'detail')),
  )
}
function List({ variant, tick }: { variant: Variant; tick: number }) {
  const rows = Array.from({ length: ROWS }, (_, i) => h(Row, { key: i, variant, i: i + tick }))
  return variant === 'scoped leaf'
    ? h(HozoInheritedScope, { style: { color: '#111111', fontSize: 14 } }, rows)
    : h('NativeView', null, rows)
}

// A pressable's label colour changing under opaque label components: the
// case only a runtime route can serve. `prop` is the hand-written equivalent,
// passing the colour to every label directly.
type Owner = 'prop' | 'scope + leaf' | 'runtime route'
const PropLabel = React.memo(({ color }: { color: string }) =>
  h('NativeText', { style: { color } }, 'label'),
)
const LeafLabel = React.memo(() => h(HozoInheritedLeafText, null, 'label'))
const RouteLabel = React.memo(() => h(HozoInheritedText, null, 'label'))
function Pressed({ owner, pressed }: { owner: Owner; pressed: boolean }) {
  const color = pressed ? '#ffffff' : '#111111'
  const labels = Array.from({ length: LABELS }, (_, i) =>
    owner === 'prop'
      ? h(PropLabel, { key: i, color })
      : h(owner === 'scope + leaf' ? LeafLabel : RouteLabel, { key: i }),
  )
  if (owner === 'prop') return h('NativeView', null, labels)
  if (owner === 'scope + leaf')
    return h('NativeView', null, h(HozoInheritedScope, { style: { color } }, labels))
  return h(HozoInheritedView, { style: { color } }, labels)
}

const median = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1]

// The production test renderer commits on a later task, so timing around
// `create` measures nothing (every first draft of this read 0.00). Time from
// the root component's render to its layout effect instead: that is one
// render-and-commit, without the scheduler's wait before it. A default-lane
// update renders synchronously once started, so no yield gaps fall inside.
let started = 0
let committed: (() => void) | undefined
function Probe({ children }: { children: unknown }) {
  started = performance.now()
  React.useLayoutEffect(() => committed?.())
  return children
}
function commit(act: () => void) {
  return new Promise<number>((resolve) => {
    committed = () => resolve(performance.now() - started)
    act()
  })
}
async function time(element: (n: number) => unknown) {
  const mount: number[] = []
  const update: number[] = []
  for (let run = 0; run < RUNS; run++) {
    let root: { update(e: unknown): void; unmount(): void; toJSON(): unknown }
    mount.push(await commit(() => (root = renderer.create(h(Probe, null, element(0))))))
    update.push(await commit(() => root.update(h(Probe, null, element(1)))))
    if (!root!.toJSON()) throw new Error('nothing rendered: the measurement is not measuring')
    root!.unmount()
  }
  // The first runs warm the JIT; keep the median of the rest.
  return { mount: median(mount.slice(5)), update: median(update.slice(5)) }
}

const fmt = (n: number) => n.toFixed(2)
const verdict = (ms: number, base: number) => {
  const limit = Math.max(base * 0.05, 0.25)
  return ms - base <= limit ? 'within' : `over (+${fmt(ms - base)} ms, limit ${fmt(limit)})`
}

console.log(`List of ${ROWS} rows, median of ${RUNS - 5} runs (ms)`)
const list: Record<string, { mount: number; update: number }> = {}
for (const v of ['plain', 'leaf', 'scoped leaf', 'runtime route'] as Variant[]) {
  rowRenders = 0
  list[v] = await time((tick) => h(List, { variant: v, tick }))
  // A mount and an update per run: anything less means rows were skipped.
  if (rowRenders !== RUNS * 2 * ROWS) throw new Error(`${v}: ${rowRenders} row renders`)
}
for (const [v, r] of Object.entries(list))
  console.log(
    `  ${v.padEnd(14)} mount ${fmt(r.mount).padStart(7)}  update ${fmt(r.update).padStart(7)}  update vs plain: ${verdict(r.update, list.plain.update)}`,
  )

console.log(`\nPressed colour over ${LABELS} opaque labels, median (ms)`)
const pressed: Record<string, { mount: number; update: number }> = {}
for (const o of ['prop', 'scope + leaf', 'runtime route'] as Owner[])
  pressed[o] = await time((n) => h(Pressed, { owner: o, pressed: n === 1 }))
for (const [o, r] of Object.entries(pressed))
  console.log(
    `  ${o.padEnd(14)} mount ${fmt(r.mount).padStart(7)}  toggle ${fmt(r.update).padStart(7)}  toggle vs prop: ${verdict(r.update, pressed.prop.update)}`,
  )
