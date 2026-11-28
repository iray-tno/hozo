import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AreaChart, LineChart } from './index.tsx'
import { areaChartModel, areaPath, lineChartModel, linePath, monotoneSlopes } from './model.ts'

const data = [
  { day: 'Mon', v: 10 },
  { day: 'Tue', v: 80 },
  { day: 'Wed', v: 85 },
  { day: 'Thu', v: 20 },
  { day: 'Fri', v: 20 },
  { day: 'Sat', v: 60 },
]
const input = {
  data,
  x: { key: 'day' },
  series: [{ key: 'v', label: 'Visits' }],
  width: 600,
  height: 240,
}

/** Every cubic of a path, as its four points. */
function cubics(path: string) {
  const out: number[][][] = []
  let at = [0, 0]
  for (const [, command, args] of path.matchAll(/([MLC])([^MLCZ]*)/g)) {
    const n = (args ?? '').split(/[ ,]/).filter(Boolean).map(Number)
    if (command === 'C') {
      out.push([at, [n[0], n[1]], [n[2], n[3]], [n[4], n[5]]] as number[][])
      at = [n[4] as number, n[5] as number]
    } else at = [n[0] as number, n[1] as number]
  }
  return out
}

const bezier = (p: number[][], t: number) =>
  (1 - t) ** 3 * (p[0]?.[1] as number) +
  3 * (1 - t) ** 2 * t * (p[1]?.[1] as number) +
  3 * (1 - t) * t ** 2 * (p[2]?.[1] as number) +
  t ** 3 * (p[3]?.[1] as number)

test('a monotone curve passes through every value and never beyond its neighbours', () => {
  const model = lineChartModel({ ...input, curve: 'monotone' })
  const line = model.marks.find((mark) => mark.kind === 'line')
  const points = model.marks.flatMap((mark) => (mark.kind === 'point' ? [mark] : []))
  assert.ok(line?.kind === 'line')
  const segments = cubics(line.path)
  assert.equal(segments.length, data.length - 1, 'one cubic between each pair of values')
  for (const [i, segment] of segments.entries()) {
    const [from, to] = [points[i], points[i + 1]]
    assert.ok(from && to)
    assert.deepEqual(segment[3], [Math.round(to.cx * 100) / 100, Math.round(to.cy * 100) / 100])
    const lo = Math.min(from.cy, to.cy) - 0.01
    const hi = Math.max(from.cy, to.cy) + 0.01
    for (let t = 0; t <= 1; t += 0.05) {
      const y = bezier(segment, t)
      assert.ok(y >= lo && y <= hi, `segment ${i} stays between its values at t=${t.toFixed(2)}`)
    }
  }
})

test('the tangent is flat at a peak, a dip and a level run', () => {
  const slopes = monotoneSlopes([
    [0, 0],
    [1, 5],
    [2, 0],
    [3, 0],
    [4, 3],
  ])
  assert.equal(slopes[1], 0, 'peak')
  assert.equal(slopes[2], 0, 'level run')
  const back = monotoneSlopes([
    [4, 3],
    [3, 0],
    [2, 0],
  ])
  assert.equal(back[1], 0, 'drawn right to left as well')
})

test('a curve still breaks at a gap, and two values are a straight line', () => {
  const path = linePath([[0, 0], [10, 5], [20, 0], undefined, [40, 1], [50, 2]], 'monotone')
  const [first, second] = path.split('M').filter(Boolean)
  assert.match(first ?? '', /C/)
  assert.equal(second, '40,1L50,2')
  assert.equal(
    linePath(
      [
        [0, 0],
        [10, 5],
      ],
      'monotone',
    ),
    'M0,0L10,5',
  )
  assert.equal(
    linePath([
      [0, 0],
      [10, 5],
      [20, 1],
    ]),
    'M0,0L10,5L20,1',
    'linear by default',
  )
})

test('a curved area bends along both edges of a stacked band', () => {
  const path = areaPath(
    [
      [0, 10, 50],
      [10, 0, 40],
      [20, 5, 45],
    ],
    'monotone',
  )
  assert.equal(
    (path.match(/C/g) ?? []).length,
    4,
    'two cubics along the top, two back along the bottom',
  )
  assert.ok(path.endsWith('Z'))
  const model = areaChartModel({ ...input, curve: 'monotone' })
  const area = model.marks.find((mark) => mark.kind === 'area')
  assert.ok(area?.kind === 'area' && area.path.includes('C'))
})

test('Line and Area take curve as a prop, and nothing read aloud changes', () => {
  const props = { accessibilityLabel: 'Visits', ...input }
  const curved = renderToStaticMarkup(<LineChart {...props} curve="monotone" />)
  const straight = renderToStaticMarkup(<LineChart {...props} />)
  assert.match(curved, /<path d="M[^"]*C[^"]*" fill="none"/)
  assert.doesNotMatch(straight, /<path d="M[^"]*C/)
  const table = (html: string) => html.slice(html.indexOf('<table'))
  assert.equal(table(curved), table(straight))
  assert.match(
    renderToStaticMarkup(<AreaChart {...props} curve="monotone" />),
    /<path d="M[^"]*C[^"]*Z"/,
  )
})
