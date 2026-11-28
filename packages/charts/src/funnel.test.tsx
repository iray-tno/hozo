import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { datumSentence, nextDatum } from './active.ts'
import { funnelChartModel, funnelSeries, KEPT_LABEL, keptFractions, percent } from './funnel.ts'
import { FunnelChart } from './index.tsx'
import { interpolateModel } from './motion.ts'
import { chartSummary } from './summary.ts'

const data = [
  { stage: 'Visit', people: 1000 },
  { stage: 'Signup', people: 400 },
  { stage: 'Trial', people: 200 },
  { stage: 'Purchase', people: 50 },
]
const value = { key: 'people', label: 'People', format: (n: number) => n.toLocaleString('en-US') }
const input = { data, x: { key: 'stage' }, value, width: 400, height: 200 }

/** The x of each corner of a stage's path, in path order. */
function corners(path: string): number[][] {
  return [...path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
}

test('what each stage kept of the one before, with none for the first or after a gap', () => {
  assert.deepEqual(keptFractions([1000, 400, 200, 50]), [undefined, 0.4, 0.5, 0.25])
  assert.deepEqual(keptFractions([100, undefined, 50]), [undefined, undefined, undefined])
  assert.deepEqual(keptFractions([0, 10]), [undefined, undefined], 'nothing is a share of zero')
  assert.equal(percent(0.125), '12.5%')
  assert.equal(percent(1 / 3), '33.3%')
})

test('a trapezoid per stage, top to bottom, its top as wide as its value and its bottom the next', () => {
  const model = funnelChartModel(input)
  const stages = model.marks.filter((mark) => mark.kind === 'stage')
  assert.deepEqual(
    stages.map((mark) => mark.datum),
    [0, 1, 2, 3],
  )
  const { plot } = model
  const widths = stages.map((mark) => {
    const [tl, tr, br, bl] = corners(mark.path) as [number[], number[], number[], number[]]
    return {
      top: (tr[0] as number) - (tl[0] as number),
      bottom: (br[0] as number) - (bl[0] as number),
      y: tl[1] as number,
    }
  })
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05
  assert.ok(near(widths[0]?.top ?? 0, plot.width), 'the widest stage fills the plot')
  assert.ok(near(widths[1]?.top ?? 0, plot.width * 0.4))
  assert.ok(near(widths[0]?.bottom ?? 0, widths[1]?.top ?? 0), 'each narrows to the next')
  assert.ok(near(widths[3]?.bottom ?? 0, widths[3]?.top ?? 0), 'the last keeps its width')
  // A 2px gap of surface between stages.
  const band = (plot.height - 2 * 3) / 4
  assert.ok(near((widths[1]?.y ?? 0) - (widths[0]?.y ?? 0), band + 2))
  // Centred: each top edge has the same middle.
  for (const mark of stages) {
    const [tl, tr] = corners(mark.path) as [number[], number[]]
    assert.ok(near(((tl[0] as number) + (tr[0] as number)) / 2, plot.x + plot.width / 2))
  }
})

test('names on the left and values with their share on the right, inside the chart', () => {
  const model = funnelChartModel(input)
  const left = model.funnel.labels.filter((label) => label.anchor === 'end')
  const right = model.funnel.labels.filter((label) => label.anchor === 'start')
  assert.deepEqual(
    left.map((label) => label.text),
    ['Visit', 'Signup', 'Trial', 'Purchase'],
  )
  assert.deepEqual(
    right.map((label) => label.text),
    ['1,000', '400 (40%)', '200 (50%)', '50 (25%)'],
  )
  for (const label of left) assert.ok(label.x <= model.plot.x)
  for (const label of right) {
    assert.ok(label.x >= model.plot.x + model.plot.width)
    assert.ok(label.x + label.text.length * 12 * 0.6 <= model.width + 0.01, `${label.text} fits`)
  }
})

test('a stage with no value draws nothing, and the one before keeps its width', () => {
  const model = funnelChartModel({
    ...input,
    data: [
      { stage: 'Visit', people: 1000 },
      { stage: 'Signup', people: null },
      { stage: 'Trial', people: 200 },
    ],
  })
  const stages = model.marks.filter((mark) => mark.kind === 'stage')
  assert.deepEqual(
    stages.map((mark) => mark.datum),
    [0, 2],
  )
  const [tl, tr, br, bl] = corners(stages[0]?.path ?? '') as number[][]
  assert.equal((tr?.[0] ?? 0) - (tl?.[0] ?? 0), (br?.[0] ?? 0) - (bl?.[0] ?? 0))
  assert.deepEqual(model.values, [
    [1000, undefined, 200],
    [undefined, undefined, undefined],
  ])
})

test('the table, the sentence and the summary read the drop between stages', () => {
  const model = funnelChartModel(input)
  const series = funnelSeries(value)
  assert.equal(datumSentence(model, series, 1), `Signup. People: 400. ${KEPT_LABEL}: 40%.`)
  assert.equal(datumSentence(model, series, 0), `Visit. People: 1,000. ${KEPT_LABEL}: No value.`)
  assert.equal(
    chartSummary(model, series),
    '4 categories, Visit to Purchase. People: lowest 50 at Purchase, highest 1,000 at Visit. ' +
      `${KEPT_LABEL}: Signup 40%, Trial 50%, Purchase 25%. Purchase is 5% of Visit.`,
  )
  const html = renderToStaticMarkup(
    <FunnelChart
      accessibilityLabel="Signup funnel"
      data={data}
      x={{ key: 'stage', label: 'Stage' }}
      value={value}
      width={400}
      height={200}
    />,
  )
  assert.match(
    html,
    /<th[^>]*>Stage<\/th><th[^>]*>People<\/th><th[^>]*>Kept from the stage before<\/th>/,
  )
  assert.match(html, /<th[^>]*>Signup<\/th><td[^>]*>400<\/td><td[^>]*>40%<\/td>/)
  assert.match(html, /Purchase is 5% of Visit\./)
})

test('stages are stepped with Up and Down, and found by the pointer by row', () => {
  const model = funnelChartModel(input)
  assert.equal(model.horizontal, true)
  assert.equal(nextDatum('ArrowDown', 0, 4, model.horizontal), 1)
  assert.equal(nextDatum('ArrowUp', 2, 4, model.horizontal), 1)
  const band = (model.plot.height - 6) / 4
  assert.equal(model.datumAt(0, 1), 0)
  assert.equal(model.datumAt(0, band + 3), 1)
  assert.equal(model.datumAt(0, model.height - 1), 3)
  assert.equal(model.datumAt(0, model.height + 10), -1)
})

test('stages blend between data, keeping their shape', () => {
  const from = funnelChartModel(input)
  const to = funnelChartModel({
    ...input,
    data: data.map((row) => ({ ...row, people: row.people / 2 + 10 })),
  })
  const half = interpolateModel(from, to, 0.5)
  const path = half.marks.find((mark) => mark.kind === 'stage' && mark.datum === 1)
  const a = from.marks.find((mark) => mark.kind === 'stage' && mark.datum === 1)
  const b = to.marks.find((mark) => mark.kind === 'stage' && mark.datum === 1)
  assert.ok(path?.kind === 'stage' && a?.kind === 'stage' && b?.kind === 'stage')
  assert.notEqual(path.path, a.path)
  assert.notEqual(path.path, b.path)
  assert.equal(path.path.replace(/[\d.-]+/g, '#'), b.path.replace(/[\d.-]+/g, '#'))
})

test('no data says so, and draws nothing', () => {
  const model = funnelChartModel({ ...input, data: [] })
  assert.equal(model.marks.length, 0)
  assert.equal(model.datumAt(0, 10), -1)
  assert.equal(chartSummary(model, funnelSeries(value)), 'No data.')
})
