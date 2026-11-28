import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { datumSentence } from './active.ts'
import { ComposedChart, DEFAULT_PALETTE } from './index.tsx'
import { composedChartModel, type Mark } from './model.ts'

const data = [
  { month: 'Jan', online: 120, store: 80, target: 180 },
  { month: 'Feb', online: 200, store: null, target: 190 },
  { month: 'Mar', online: 90, store: 60, target: null },
]
const series = [
  { key: 'online', label: 'Online' },
  { key: 'store', label: 'In store' },
  { key: 'target', label: 'Target', type: 'line' as const },
]
const base = { data, x: { key: 'month' }, series, width: 400, height: 240 }
const kind = <K extends Mark['kind']>(marks: Mark[], k: K) =>
  marks.filter((mark): mark is Extract<Mark, { kind: K }> => mark.kind === k)

test('bar series share each band and a line series runs through the centres', () => {
  const model = composedChartModel(base)
  const bars = kind(model.marks, 'bar')
  assert.equal(bars.length, 5, 'no bar for the missing in-store February')
  assert.ok(
    bars.every((bar) => bar.series !== 2),
    'the target is not a bar',
  )
  const [online, store] = [bars[0], bars.find((bar) => bar.series === 1)]
  assert.ok(online && store && Math.abs(store.x - (online.x + online.width) - 2) < 0.01)
  const line = kind(model.marks, 'line')
  assert.equal(line.length, 1)
  assert.equal(line[0]?.series, 2, 'the line keeps its own series index, so its colour')
  const points = kind(model.marks, 'point')
  assert.deepEqual(
    points.map((point) => point.cx),
    model.centers.slice(0, 2),
    'one dot per target value, at the band centre',
  )
  const kinds = model.marks.map((mark) => mark.kind)
  assert.ok(kinds.lastIndexOf('bar') < kinds.indexOf('line'), 'bars first, the line over them')
  assert.equal(Number(model.yTicks[0]?.label), 0, 'zero is in the domain for the bars')
})

test('the sentence and table read every series alike, whatever its mark', () => {
  const model = composedChartModel(base)
  assert.equal(
    datumSentence(model, series, 1),
    'Feb. Online: 200. In store: No value. Target: 190.',
  )
  const html = renderToStaticMarkup(<ComposedChart accessibilityLabel="Revenue" {...base} />)
  assert.equal(
    [...html.matchAll(/<path d="M[^"]*A[^"]*" fill="#/g)].length,
    5,
    'one rounded bar per value',
  )
  assert.match(html, new RegExp(`<path [^>]*stroke="${DEFAULT_PALETTE[2]}"`))
  const headers = [...html.matchAll(/<th[^>]*scope="col"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1])
  assert.deepEqual(headers, ['Category', 'Online', 'In store', 'Target'])
})
