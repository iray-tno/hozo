import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BarChart, ChartSync, LineChart } from './index.tsx'
import { syncedActive } from './sync.tsx'

test('a shared category is found by label, and only its source speaks', () => {
  const months = ['Jan', 'Feb', 'Mar']
  assert.deepEqual(syncedActive(months, { category: 'Feb', source: 'a' }, 'a'), {
    active: 1,
    speaks: true,
  })
  assert.deepEqual(syncedActive(months, { category: 'Feb', source: 'a' }, 'b'), {
    active: 1,
    speaks: false,
  })
  assert.deepEqual(
    syncedActive(['Feb', 'Mar'], { category: 'Feb', source: 'a' }, 'b'),
    { active: 0, speaks: false },
    'a chart with other rows meets on the label',
  )
  assert.deepEqual(syncedActive(months, { category: 'Dec', source: 'a' }, 'b'), {
    active: undefined,
    speaks: false,
  })
  assert.deepEqual(syncedActive(months, { category: null, source: null }, 'b'), {
    active: undefined,
    speaks: false,
  })
})

const props = {
  x: { key: 'month' },
  series: [{ key: 'v', label: 'Visits' }],
  width: 600,
  height: 200,
}
const tooltips = (html: string) => [...html.matchAll(/<text[^>]*font-weight="bold"[^>]*>([^<]*)</g)]

test('every chart in a ChartSync shows the shared category, and none speaks for it', () => {
  const html = renderToStaticMarkup(
    <ChartSync category="Feb">
      <BarChart
        accessibilityLabel="Visits"
        {...props}
        data={[
          { month: 'Jan', v: 1 },
          { month: 'Feb', v: 2 },
        ]}
      />
      <LineChart
        accessibilityLabel="Sign-ups"
        {...props}
        data={[
          { month: 'Feb', v: 5 },
          { month: 'Mar', v: 6 },
        ]}
      />
    </ChartSync>,
  )
  assert.equal(tooltips(html).length, 2, 'a tooltip in each chart')
  assert.ok(tooltips(html).every((match) => match[1] === 'Feb'))
  assert.equal(
    [...html.matchAll(/<div aria-live="polite"[^>]*><\/div>/g)].length,
    2,
    'a category set from outside is shown, not announced',
  )
  const outside = renderToStaticMarkup(
    <LineChart
      accessibilityLabel="Visits"
      {...props}
      data={[
        { month: 'Jan', v: 1 },
        { month: 'Feb', v: 2 },
      ]}
    />,
  )
  assert.equal(tooltips(outside).length, 0, 'a chart outside a ChartSync keeps its own state')
})
