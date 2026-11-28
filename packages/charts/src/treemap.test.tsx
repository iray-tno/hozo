import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { datumSentence } from './active.ts'
import { TreemapChart } from './index.tsx'
import { interpolateModel } from './motion.ts'
import { chartSummary } from './summary.ts'
import {
  labelInk,
  type Rect,
  SHARE_LABEL,
  squarify,
  treemapChartModel,
  treemapSeries,
  treeStep,
} from './treemap.ts'

const data = [
  {
    team: 'Hardware',
    children: [
      { team: 'Phones', budget: 200 },
      { team: 'Laptops', budget: 150 },
      { team: 'Tablets', budget: 50 },
    ],
  },
  {
    team: 'Software',
    children: [
      { team: 'Apps', budget: 300 },
      { team: 'Cloud', budget: 100 },
    ],
  },
  { team: 'Design', budget: 200 },
]
const value = { key: 'budget', label: 'Budget', format: (n: number) => `$${n}` }
const input = { data, x: { key: 'team' }, value, width: 400, height: 300 }
const area = (rect: Rect | undefined) => (rect ? rect.width * rect.height : 0)
const near = (a: number, b: number, by = 0.5) => Math.abs(a - b) < by

test('squarify gives each value its share of the area, inside the rectangle', () => {
  const rect = { x: 10, y: 20, width: 600, height: 400 }
  const values = [6, 6, 4, 3, 2, 2, 1]
  const rects = squarify(values, rect)
  const whole = rect.width * rect.height
  for (const [i, value] of values.entries()) {
    const r = rects[i] as Rect
    assert.ok(near(area(r), (value / 24) * whole, 1e-6), `area of ${i}`)
    assert.ok(r.x >= rect.x - 1e-9 && r.x + r.width <= rect.x + rect.width + 1e-9)
    assert.ok(r.y >= rect.y - 1e-9 && r.y + r.height <= rect.y + rect.height + 1e-9)
  }
  // Bruls et al.'s own example: no rectangle worse than 1:3.
  for (const r of rects as Rect[])
    assert.ok(Math.max(r.width / r.height, r.height / r.width) < 3, 'squarified')
  assert.deepEqual(squarify([0, -1, 5], rect).slice(0, 2), [undefined, undefined])
  assert.deepEqual(squarify([], rect), [])
})

test('nodes depth first, groups summing their children, each with its share of its group', () => {
  const model = treemapChartModel(input)
  assert.deepEqual(model.categories, [
    'Hardware',
    'Phones',
    'Laptops',
    'Tablets',
    'Software',
    'Apps',
    'Cloud',
    'Design',
  ])
  assert.deepEqual(model.values[0], [400, 200, 150, 50, 400, 300, 100, 200])
  assert.deepEqual(model.values[1], [0.4, 0.5, 0.375, 0.125, 0.4, 0.75, 0.25, 0.2])
  assert.deepEqual(model.tree.parent, [-1, 0, 0, 0, -1, 4, 4, -1])
  assert.deepEqual(model.tree.tone, [0, 0, 0, 0, 1, 1, 1, 2])
  assert.equal(model.tree.path[1], 'Hardware, Phones')
})

test('only leaves are drawn, each inside its group, with areas in proportion', () => {
  const model = treemapChartModel(input)
  const cells = model.marks.filter((mark) => mark.kind === 'cell')
  assert.deepEqual(
    cells.map((mark) => mark.datum),
    [1, 2, 3, 5, 6, 7],
  )
  const { rects } = model.tree
  for (const mark of cells) {
    const group = rects[model.tree.parent[mark.datum] ?? -1] ?? model.plot
    assert.ok(mark.x >= group.x && mark.x + mark.width <= group.x + group.width + 0.01)
    assert.ok(mark.y >= group.y && mark.y + mark.height <= group.y + group.height + 0.01)
  }
  // The groups' areas, before their gaps, are 4:4:2; the gaps shave a
  // little off each, so the ratio holds to within a few percent.
  const ratio = area(rects[0]) / area(rects[7])
  assert.ok(ratio > 1.9 && ratio < 2.1, `Hardware is twice Design: ${ratio}`)
  // The key of the three groups takes the top of the chart.
  assert.deepEqual(
    model.tree.legend.map((key) => key.label),
    ['Hardware', 'Software', 'Design'],
  )
  assert.ok(model.plot.y > 0)
})

test('a name inside its rectangle only where it fits, in black or white for contrast', () => {
  assert.equal(labelInk('#2563eb'), '#ffffff', 'blue-600')
  assert.equal(labelInk('#d97706'), '#000000', 'amber-600')
  assert.equal(labelInk('#16a34a'), '#000000', 'green-600')
  assert.equal(labelInk('#fff'), '#000000')
  assert.equal(labelInk('rebeccapurple'), '#ffffff', 'a colour it cannot read')
  const narrow = treemapChartModel({ ...input, width: 120, height: 90 })
  const wide = treemapChartModel(input)
  assert.ok(wide.tree.labels.some((label) => label.text === 'Phones'))
  assert.ok(narrow.tree.labels.length < wide.tree.labels.length)
  for (const label of wide.tree.labels) {
    const rect = wide.tree.rects[label.datum] as Rect
    assert.ok(label.x >= rect.x && label.y <= rect.y + rect.height)
  }
})

test('the arrows move among siblings, Enter goes in and Escape comes out', () => {
  const { tree } = treemapChartModel(input)
  assert.equal(treeStep(tree, 'ArrowRight', undefined), 0)
  assert.equal(treeStep(tree, 'End', undefined), 7)
  assert.equal(treeStep(tree, 'ArrowRight', 0), 4, 'Hardware to Software, over its children')
  assert.equal(treeStep(tree, 'ArrowDown', 4), 7)
  assert.equal(treeStep(tree, 'ArrowRight', 7), 7, 'stops at the last')
  assert.equal(treeStep(tree, 'Enter', 4), 5, 'into Apps')
  assert.equal(treeStep(tree, 'ArrowRight', 5), 6)
  assert.equal(treeStep(tree, 'Home', 6), 5)
  assert.equal(treeStep(tree, 'Escape', 6), 4)
  assert.equal(treeStep(tree, 'Escape', 4), undefined, 'the top level has nowhere out to')
  assert.equal(treeStep(tree, 'Enter', 7), undefined, 'a leaf has nothing in it')
  assert.equal(treeStep(tree, 'a', 0), undefined)
})

test('the pointer finds the leaf under it', () => {
  const model = treemapChartModel(input)
  for (const mark of model.marks)
    if (mark.kind === 'cell')
      assert.equal(model.datumAt(mark.x + mark.width / 2, mark.y + mark.height / 2), mark.datum)
  assert.equal(model.datumAt(-5, -5), -1)
})

test('read aloud with its groups and its share, and summarised by the top level', () => {
  const model = treemapChartModel(input)
  const series = treemapSeries(value)
  assert.equal(
    datumSentence(model, series, 2),
    `Hardware, Laptops. Budget: $150. ${SHARE_LABEL}: 37.5%.`,
  )
  assert.equal(
    chartSummary(model, series),
    '3 groups, 6 items in all, totalling $1000. ' +
      'Hardware $400 (40%), largest Phones $200; Software $400 (40%), largest Apps $300; ' +
      'Design $200 (20%).',
  )
})

test('a leaf with no value is a gap: not drawn, not added, still read', () => {
  const model = treemapChartModel({
    ...input,
    data: [{ team: 'A', children: [{ team: 'B', budget: 10 }, { team: 'C' }] }],
  })
  assert.deepEqual(model.values[0], [10, 10, undefined])
  assert.deepEqual(
    model.marks.map((mark) => ('datum' in mark ? mark.datum : -1)),
    [1],
  )
  assert.match(chartSummary(model, treemapSeries(value)), /1 without a value\.$/)
  assert.equal(chartSummary(treemapChartModel({ ...input, data: [] }), []), 'No data.')
})

test('a cell moves to its new rectangle', () => {
  const from = treemapChartModel(input)
  const to = treemapChartModel({ ...input, width: 200 })
  const half = interpolateModel(from, to, 0.5)
  const [a, b, c] = [from, to, half].map((model) =>
    model.marks.find((mark) => mark.kind === 'cell'),
  )
  assert.ok(a?.kind === 'cell' && b?.kind === 'cell' && c?.kind === 'cell')
  assert.ok(near(c.width, (a.width + b.width) / 2, 0.01))
})

test('the rendered chart: a Group column, the share column and the leaves drawn', () => {
  const html = renderToStaticMarkup(
    <TreemapChart
      accessibilityLabel="Budget by team"
      data={data}
      x={{ key: 'team', label: 'Team' }}
      value={value}
      width={400}
      height={300}
    />,
  )
  assert.match(html, /<th scope="col">Team<\/th><th scope="col">Group<\/th>/)
  assert.match(html, new RegExp(`<th scope="col">${SHARE_LABEL}</th>`))
  assert.match(html, /<th scope="row">Phones<\/th><td>Hardware<\/td><td>\$200<\/td><td>50%<\/td>/)
  assert.match(html, /<th scope="row">Design<\/th><td>All<\/td>/)
  assert.equal((html.match(/<rect[^>]*rx="2"/g) ?? []).length, 6 + 3, 'six leaves and three keys')
})
